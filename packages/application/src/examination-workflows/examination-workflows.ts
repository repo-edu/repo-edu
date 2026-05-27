import type {
  DiagnosticOutput,
  ExaminationArchivedProvenance,
  ExaminationArchiveRecord,
  ExaminationGenerateOutput,
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLookupQuestionSummariesResult,
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  EXAMINATION_PROMPT_TEMPLATE_VERSION,
  EXAMINATION_REDACTION_POLICY_VERSION,
} from "@repo-edu/application-contract"
import type { LlmUsage } from "@repo-edu/host-runtime-contract"
import { createValidationAppError } from "../core.js"
import { throwIfAborted } from "../workflow-helpers.js"
import {
  archiveSoftStoppedQuestions,
  assertOutputAllowedForCurrentContext,
  isRecordAllowedForCurrentContext,
  isRecordCurrentArchivePolicy,
  putSupersedingArchiveRecord,
  resolveArchiveContext,
  toResult,
} from "./archive-results.js"
import {
  validateGenerateInput,
  validateLookupInput,
  validateLookupSummariesInput,
  validateStopInput,
} from "./input-validation.js"
import type { ExaminationWorkflowPorts } from "./ports.js"
import { buildExaminationPrompt } from "./prompt-builder.js"
import { prepareExaminationProviderExcerpts } from "./provider-excerpts.js"
import {
  buildPromptSourceLineRanges,
  buildStreamedTextPreview,
  maybeEmitPartial,
  normalizeQuestionAnchors,
  type PartialQuestionEmissionState,
  parseQuestions,
  providerError,
} from "./question-parser.js"
import { assertNoRequiredRedactionLeaks } from "./redaction.js"
import {
  createSoftStopSession,
  type SoftStopSession,
} from "./soft-stop-session.js"
import { createPrepareSubmissionSourceHandler } from "./submission-source.js"

type ExaminationWorkflowId =
  | "examination.generateQuestions"
  | "examination.stopGeneration"
  | "examination.lookupQuestions"
  | "examination.prepareSubmissionSource"
  | "examination.lookupQuestionSummaries"

export function createExaminationWorkflowHandlers(
  ports: ExaminationWorkflowPorts,
): Pick<WorkflowHandlerMap<ExaminationWorkflowId>, ExaminationWorkflowId> {
  const softStopSessions = new Map<string, SoftStopSession>()

  return {
    ...createPrepareSubmissionSourceHandler(ports),
    "examination.generateQuestions": async (
      input: ExaminationGenerateQuestionsInput,
      options?: WorkflowCallOptions<
        MilestoneProgress,
        ExaminationGenerateOutput
      >,
    ): Promise<ExaminationGenerateQuestionsResult> => {
      validateGenerateInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Preparing redacted excerpts.",
      })

      const prepared = await prepareExaminationProviderExcerpts({
        excerpts: input.excerpts,
        excerptFileSources: input.excerptFileSources,
        localIdentityContext: input.localIdentityContext,
        tokenizer: ports.tokenizer,
        questionCount: input.questionCount,
      })
      const { archiveKey, resolution } = resolveArchiveContext(
        input,
        prepared.providerPayloadFingerprint,
      )
      const sourceDescriptors = prepared.promptPayload.excerpts.map(
        (excerpt) => excerpt.sourceDescriptor,
      )
      const sourceLineRanges = buildPromptSourceLineRanges(
        prepared.promptPayload.excerpts,
      )
      const seedQuestions =
        input.seedQuestions === undefined
          ? []
          : normalizeQuestionAnchors(input.seedQuestions, sourceLineRanges)
      assertOutputAllowedForCurrentContext(
        seedQuestions,
        input,
        sourceDescriptors,
      )
      const requestedGeneratedQuestionCount =
        input.questionCount - seedQuestions.length

      if (!input.regenerate) {
        const hit = ports.archive.get(archiveKey)
        if (
          hit &&
          isRecordAllowedForCurrentContext(hit, input, sourceDescriptors)
        ) {
          options?.onProgress?.({
            step: 3,
            totalSteps: 3,
            label: "Returning archived questions.",
          })
          return toResult(hit, {
            fromArchive: true,
            sourceReferences: prepared.sourceReferences,
            requestedQuestionCount: input.questionCount,
          })
        }
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Building prompt.",
      })

      const prompt = buildExaminationPrompt(
        {
          ...prepared.promptPayload,
          questionCount: requestedGeneratedQuestionCount,
        },
        { seedQuestions },
      )
      try {
        assertNoRequiredRedactionLeaks({
          renderedPrompt: prompt,
          requiredChecks: prepared.requiredChecks,
          allowedSourceDescriptors: sourceDescriptors,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Prompt redaction failed."
        throw createValidationAppError(message, [{ path: "prompt", message }])
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Waiting for LLM response.",
      })

      const softStop = createSoftStopSession(
        softStopSessions,
        input.generationControlId,
      )
      const partialState: PartialQuestionEmissionState = {
        acceptedQuestions: seedQuestions,
        emittedQuestionCount: seedQuestions.length,
        warnedOverQuota: false,
        emittedInProgressQuestion: "",
        emittedInProgressAnswer: "",
      }
      const warnOverQuota = (actualCount: number): void => {
        if (partialState.warnedOverQuota) return
        partialState.warnedOverQuota = true
        options?.onOutput?.({
          kind: "warn",
          message:
            seedQuestions.length === 0
              ? `Provider returned ${actualCount} of ${input.questionCount} requested examination questions. Extra questions were ignored.`
              : `Provider returned ${actualCount} of ${requestedGeneratedQuestionCount} requested additional examination questions. Extra questions were ignored.`,
        })
      }
      let buffer = ""
      let finalUsage: LlmUsage | null = null

      try {
        const stream = ports.llm.stream({
          spec: {
            provider: resolution.spec.provider,
            family: resolution.spec.family,
            modelId: resolution.spec.modelId,
            effort: resolution.spec.effort,
          },
          prompt,
          signal: softStop.providerSignal(options?.signal),
        })

        try {
          for await (const event of stream) {
            throwIfAborted(options?.signal)
            if (softStop.requested) break
            if (event.kind === "text-delta") {
              buffer += event.text
              options?.onOutput?.({
                kind: "stream-progress",
                streamedCharacterCount: buffer.length,
                streamedTextPreview: buildStreamedTextPreview(buffer),
                activityLabel: "Receiving model response.",
              })
              maybeEmitPartial({
                buffer,
                emittedQuestionCount: partialState,
                onOutput: options?.onOutput,
                seedQuestions,
                sourceLineRanges,
                sourceReferences: prepared.sourceReferences,
                requestedQuestionCount: requestedGeneratedQuestionCount,
                onOverQuota: warnOverQuota,
                assertOutputAllowed: (questions) =>
                  assertOutputAllowedForCurrentContext(
                    questions,
                    input,
                    sourceDescriptors,
                  ),
              })
            } else if (event.kind === "activity") {
              options?.onOutput?.({
                kind: "stream-progress",
                streamedCharacterCount: buffer.length,
                streamedTextPreview: buildStreamedTextPreview(buffer),
                activityLabel: event.label,
              })
            } else {
              finalUsage = event.usage
            }
          }
        } catch (error) {
          throwIfAborted(options?.signal)
          if (softStop.requested) {
            return archiveSoftStoppedQuestions({
              acceptedQuestions: partialState.acceptedQuestions,
              archiveKey,
              input,
              minimumAcceptedQuestionCount: seedQuestions.length,
              ports,
              resolution,
              sourceReferences: prepared.sourceReferences,
            })
          }
          throw error
        }

        throwIfAborted(options?.signal)
        if (softStop.requested) {
          return archiveSoftStoppedQuestions({
            acceptedQuestions: partialState.acceptedQuestions,
            archiveKey,
            input,
            minimumAcceptedQuestionCount: seedQuestions.length,
            ports,
            resolution,
            sourceReferences: prepared.sourceReferences,
          })
        }
        if (finalUsage === null) {
          throw providerError(
            "LLM stream ended without a terminal usage event.",
          )
        }

        const generatedQuestions = parseQuestions(
          buffer,
          requestedGeneratedQuestionCount,
          sourceLineRanges,
          { onOverQuota: warnOverQuota },
        )
        const questions = [...seedQuestions, ...generatedQuestions]
        assertOutputAllowedForCurrentContext(
          questions,
          input,
          sourceDescriptors,
        )
        const acceptedQuestionCount = questions.length
        if (generatedQuestions.length < requestedGeneratedQuestionCount) {
          options?.onOutput?.({
            kind: "warn",
            message:
              seedQuestions.length === 0
                ? `Provider returned ${acceptedQuestionCount} of ${input.questionCount} requested examination questions. The partial set was stored under its actual question count.`
                : `Provider returned ${generatedQuestions.length} of ${requestedGeneratedQuestionCount} requested additional examination questions. The partial set was stored under its actual question count.`,
          })
        }
        const resultArchiveKey =
          acceptedQuestionCount === archiveKey.questionCount
            ? archiveKey
            : { ...archiveKey, questionCount: acceptedQuestionCount }

        const provenance: ExaminationArchivedProvenance = {
          model: resolution.code,
          effort: resolution.spec.effort,
          questionCount: acceptedQuestionCount,
          usage: finalUsage,
          createdAtMs: Date.now(),
          redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
          promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
        }

        const record: ExaminationArchiveRecord = {
          key: resultArchiveKey,
          questions,
          provenance,
        }

        putSupersedingArchiveRecord(ports.archive, record)

        return toResult(record, {
          fromArchive: false,
          sourceReferences: prepared.sourceReferences,
          requestedQuestionCount: input.questionCount,
        })
      } finally {
        softStop.dispose()
      }
    },
    "examination.stopGeneration": async (input) => {
      validateStopInput(input)
      const session = softStopSessions.get(input.generationControlId)
      if (session === undefined) {
        return { stopped: false, reason: "not-running" }
      }
      session.requestStop()
      return { stopped: true }
    },
    "examination.lookupQuestions": async (
      input: ExaminationLookupQuestionsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationLookupQuestionsResult> => {
      validateLookupInput(input)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Preparing redacted excerpts.",
      })

      const prepared = await prepareExaminationProviderExcerpts({
        excerpts: input.excerpts,
        excerptFileSources: input.excerptFileSources,
        localIdentityContext: input.localIdentityContext,
        tokenizer: ports.tokenizer,
        questionCount: input.questionCount,
      })
      const { archiveKey } = resolveArchiveContext(
        input,
        prepared.providerPayloadFingerprint,
      )

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Checking archived questions.",
      })

      const exact = ports.archive.get(archiveKey)
      const sourceDescriptors = prepared.promptPayload.excerpts.map(
        (excerpt) => excerpt.sourceDescriptor,
      )
      const availableSets = ports.archive
        .listForExcerpts({
          personId: archiveKey.personId,
          contentScopeId: archiveKey.contentScopeId,
          providerPayloadFingerprint: archiveKey.providerPayloadFingerprint,
        })
        .filter(
          (record) =>
            isRecordCurrentArchivePolicy(record) &&
            isRecordAllowedForCurrentContext(record, input, sourceDescriptors),
        )
        .map((record) =>
          toResult(record, {
            fromArchive: true,
            sourceReferences: prepared.sourceReferences,
            requestedQuestionCount: record.provenance.questionCount,
          }),
        )
      return {
        requestedKey: archiveKey,
        sourceReferences: prepared.sourceReferences,
        exact:
          exact === undefined ||
          !isRecordAllowedForCurrentContext(exact, input, sourceDescriptors)
            ? null
            : toResult(exact, {
                fromArchive: true,
                sourceReferences: prepared.sourceReferences,
                requestedQuestionCount: input.questionCount,
              }),
        availableSets,
      }
    },
    "examination.lookupQuestionSummaries": async (
      input,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationLookupQuestionSummariesResult> => {
      validateLookupSummariesInput(input)

      const summaries: ExaminationLookupQuestionSummariesResult["summaries"] =
        []
      let step = 0
      const totalSteps = Math.max(input.subjects.length, 1)
      for (const subject of input.subjects) {
        throwIfAborted(options?.signal)
        step += 1
        options?.onProgress?.({
          step,
          totalSteps,
          label: "Checking archived question summaries.",
        })

        const prepared = await prepareExaminationProviderExcerpts({
          excerpts: subject.excerpts,
          excerptFileSources: subject.excerptFileSources,
          localIdentityContext: subject.localIdentityContext,
          tokenizer: ports.tokenizer,
          questionCount: 1,
        })
        const sourceDescriptors = prepared.promptPayload.excerpts.map(
          (excerpt) => excerpt.sourceDescriptor,
        )
        const sets = ports.archive
          .listForExcerpts({
            personId: subject.personId,
            contentScopeId: subject.contentScopeId,
            providerPayloadFingerprint: prepared.providerPayloadFingerprint,
          })
          .filter(
            (record) =>
              isRecordCurrentArchivePolicy(record) &&
              isRecordAllowedForCurrentContext(
                record,
                subject,
                sourceDescriptors,
              ),
          )
          .map((record) => ({
            key: record.key,
            provenance: record.provenance,
          }))
        summaries.push({ subjectId: subject.subjectId, sets })
      }
      return { summaries }
    },
  }
}
