import type {
  ExaminationLookupQuestionSummariesInput,
  ExaminationLookupQuestionSummariesResult,
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
} from "@repo-edu/application-contract"
import { serializeExaminationArchiveStorageKey } from "@repo-edu/application-contract"
import type { SessionOperationScope } from "../../../session/session-operations.js"
import type { analysisSourceKeyFromSurface } from "../../../session/session-reducer.js"
import { useExaminationStore } from "../../../stores/examination-store.js"
import type { useToastStore } from "../../../stores/toast-store.js"
import {
  toAvailableArchiveEntry,
  toExaminationEntry,
} from "./archive-entries.js"
import {
  buildArchiveKeyIdentityKey,
  type ExaminationSource,
  type PreparedExaminationSubject,
  type SourceIdentity,
} from "./source.js"

export type ExaminationLookupContext = {
  source: ExaminationSource
  selectedSubject: PreparedExaminationSubject
  sourceIdentity: SourceIdentity
  sourceSessionKey: string
  sourceSummaryKey: string
  analysisSourceKey: ReturnType<typeof analysisSourceKeyFromSurface>
  lookupInput: ExaminationLookupQuestionsInput
  summaryInput: ExaminationLookupQuestionSummariesInput
}

export function buildLookupInput(
  source: ExaminationSource,
  subject: PreparedExaminationSubject,
  questionCount: number,
  llmSettings: ExaminationLookupQuestionsInput["llmSettings"],
): ExaminationLookupQuestionsInput {
  return {
    personId: subject.id,
    contentScopeId:
      source.kind === "repository-analysis"
        ? source.commitOid
        : source.contentScopeId,
    localIdentityContext: source.localIdentityContext,
    excerpts: subject.excerpts,
    excerptFileSources: subject.excerptFileSources,
    questionCount,
    llmSettings,
  }
}

export function buildSummaryInput(
  source: ExaminationSource,
): ExaminationLookupQuestionSummariesInput {
  const subjects =
    source.kind === "repository-analysis" ? source.subjects : [source.subject]
  return {
    subjects: subjects
      .filter((subject) => subject.excerpts.length > 0)
      .map((subject) => ({
        subjectId: subject.id,
        personId: subject.id,
        contentScopeId:
          source.kind === "repository-analysis"
            ? source.commitOid
            : source.contentScopeId,
        localIdentityContext: source.localIdentityContext,
        excerpts: subject.excerpts,
        excerptFileSources: subject.excerptFileSources,
      })),
  }
}

export async function refreshExaminationLookup(
  scope: SessionOperationScope,
  context: ExaminationLookupContext,
  addToast: ReturnType<typeof useToastStore.getState>["addToast"],
  reuse: boolean,
): Promise<void> {
  const { sourceIdentity, sourceSessionKey, analysisSourceKey, lookupInput } =
    context
  const state = useExaminationStore.getState()
  const metadata = state.sourceSessions.get(sourceSessionKey)?.lookupMetadata
  if (
    reuse &&
    metadata?.archiveRevision === state.archiveRevision &&
    metadata.archiveKeyIdentityKey ===
      buildArchiveKeyIdentityKey(sourceIdentity, analysisSourceKey)
  )
    return
  const started = scope.publish(() => state.startLookup(sourceSessionKey))
  if (started === null) return
  try {
    const result = await scope.run("examination.lookupQuestions", lookupInput, {
      onOutput: (output) => {
        if (output.channel === "warn")
          addToast(output.message, { tone: "warning", durationMs: 6000 })
      },
    })
    scope.publish(() =>
      applyLookupPublication(
        result,
        sourceSessionKey,
        sourceIdentity,
        analysisSourceKey,
        started,
      ),
    )
  } catch (error) {
    if (!scope.signal.aborted)
      scope.publish(() =>
        useExaminationStore
          .getState()
          .failLookup(sourceSessionKey, started.requestId),
      )
    throw error
  }
}

export async function refreshExaminationSummary(
  scope: SessionOperationScope,
  context: ExaminationLookupContext,
): Promise<void> {
  const { sourceSummaryKey, summaryInput } = context
  const started = scope.publish(() =>
    useExaminationStore.getState().startSourceSummaryLookup(sourceSummaryKey),
  )
  if (started === null) return
  try {
    const result = await scope.run(
      "examination.lookupQuestionSummaries",
      summaryInput,
    )
    scope.publish(() =>
      applySummaryPublication(result, sourceSummaryKey, started),
    )
  } catch (error) {
    if (!scope.signal.aborted)
      scope.publish(() =>
        useExaminationStore
          .getState()
          .failSourceSummaryLookup(sourceSummaryKey, started.requestId),
      )
    throw error
  }
}

export function applyLookupPublication(
  result: ExaminationLookupQuestionsResult,
  sourceSessionKey: string,
  sourceIdentity: SourceIdentity,
  analysisSourceKey: ReturnType<typeof analysisSourceKeyFromSurface>,
  started: NonNullable<
    ReturnType<ReturnType<typeof useExaminationStore.getState>["startLookup"]>
  >,
): void {
  const entryKey = serializeExaminationArchiveStorageKey(result.requestedKey)
  const resolvedIdentity =
    sourceIdentity.kind === "repository-analysis"
      ? {
          ...sourceIdentity,
          excerptScopeId: result.requestedKey.providerPayloadFingerprint,
        }
      : sourceIdentity
  useExaminationStore.getState().applyLookupResult({
    sourceSessionKey,
    requestId: started.requestId,
    archiveRevision: started.archiveRevision,
    archiveKeyIdentityKey: buildArchiveKeyIdentityKey(
      sourceIdentity,
      analysisSourceKey,
    ),
    requestedIdentity: sourceIdentity,
    resolvedIdentity,
    entryKey,
    exactEntry: result.exact === null ? null : toExaminationEntry(result.exact),
    archiveEntries: result.availableSets.map((questionSet) =>
      toAvailableArchiveEntry(questionSet),
    ),
  })
}

export function applySummaryPublication(
  result: ExaminationLookupQuestionSummariesResult,
  sourceSummaryKey: string,
  started: NonNullable<
    ReturnType<
      ReturnType<
        typeof useExaminationStore.getState
      >["startSourceSummaryLookup"]
    >
  >,
): void {
  const counts = new Map<string, number>()
  for (const group of result.summaries) {
    counts.set(
      group.subjectId,
      group.sets.reduce(
        (max, set) => Math.max(max, set.provenance.questionCount),
        0,
      ),
    )
  }
  useExaminationStore.getState().applySourceSummaryLookupResult({
    sourceSummaryKey,
    requestId: started.requestId,
    archiveRevision: started.archiveRevision,
    counts,
  })
}
