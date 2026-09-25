import type {
  ExaminationGenerateOutput,
  ExaminationGenerateQuestionsInput,
  ExaminationLookupQuestionSummariesResult,
  ExaminationLookupQuestionsResult,
  ExaminationPrepareSubmissionSourceInput,
  MilestoneProgress,
} from "@repo-edu/application-contract"
import {
  EXAMINATION_QUESTION_COUNT_MAX,
  serializeExaminationArchiveStorageKey,
} from "@repo-edu/application-contract"
import { getSpecByCode } from "@repo-edu/integrations-llm-catalog"
import { useCallback, useEffect, useMemo } from "react"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  selectActiveSurface,
  selectOperationIsAdmitted,
} from "../../../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../../../session/session-controller-context.js"
import type { SessionOperationScope } from "../../../session/session-operations.js"
import { analysisSourceKeyFromSurface } from "../../../session/session-reducer.js"
import {
  type ExaminationPreferenceSnapshot,
  examinationPreferencePersistence,
  selectExaminationPreferenceSnapshot,
  useExaminationPreferenceSnapshot,
} from "../../../stores/examination-preferences.js"
import {
  selectExaminationSession,
  selectExaminationSourceSummary,
  useExaminationStore,
} from "../../../stores/examination-store.js"
import type { ExaminationPreferencePersistenceEffect } from "../../../stores/examination-store-types.js"
import { useToastStore } from "../../../stores/toast-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { getErrorMessage } from "../../../utils/error-message.js"
import { toExaminationEntry } from "./archive-entries.js"
import {
  type ExaminationDisplaySelection,
  selectExaminationDisplay,
} from "./display-selectors.js"
import {
  applyLookupPublication,
  applySummaryPublication,
  buildLookupInput,
  buildSummaryInput,
  type ExaminationLookupContext,
  refreshExaminationLookup,
  refreshExaminationSummary,
} from "./examination-lookup-body.js"
import { resolveExaminationGenerationPlan } from "./generation-plan.js"
import { resolveExaminationModelCode } from "./llm-models.js"
import { buildMarkdownTranscript } from "./markdown-transcript.js"
import type {
  ExaminationSource,
  PreparedExaminationSubject,
  SourceIdentity,
  SourceSubject,
} from "./source.js"
import {
  buildArchiveKeyIdentityKey,
  buildRepositoryAnalysisSourceIdentity,
  buildSourceSessionKey,
  buildSourceSummaryKey,
  buildSubmissionSourceIdentity,
  getSourceSubject,
  sourceSubjects,
} from "./source.js"
import { prepareSubmissionSource } from "./submission-source-preparation.js"
import type { AvailableArchiveEntry } from "./types.js"
import { resolveExaminationBlockingReason } from "./view-state.js"

export type ExaminationEngineViewModel = {
  subjects: SourceSubject[]
  selectedSubject: SourceSubject | null
  generatedQuestionCountBySubjectId: ReadonlyMap<string, number>
  connections: ExaminationPreferenceSnapshot["connections"]
  activeConnection: ExaminationPreferenceSnapshot["activeConnection"]
  selectedModelCode: string | null
  archiveEntries: AvailableArchiveEntry[]
  showArchiveSelector: boolean
  display: ExaminationDisplaySelection
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  isGenerating: boolean
  hasLoadedQuestions: boolean
  rosterWarning: string | null
  commands: {
    selectSubject: (subjectId: string) => void
    selectConnection: (id: string) => void
    selectModelCode: (code: string) => void
    openLlmSettings: () => void
    importArchive: () => void
    exportArchive: () => void
    changeQuestionCount: (count: number) => void
    changeShowAnswers: (show: boolean) => void
    selectArchiveEntry: (entry: AvailableArchiveEntry) => void
    loadQuestions: () => void
    generate: () => void
    stopGeneration: () => void
    regenerate: () => void
    copyMarkdown: () => void
  }
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map()

function resolveActiveConnection(
  preferences: ExaminationPreferenceSnapshot,
  preferredId: string | null,
) {
  return (
    preferences.connections.find(
      (connection) => connection.id === preferredId,
    ) ??
    preferences.activeConnection ??
    null
  )
}

export function useExaminationEngine({
  source,
  emptyBlocker,
  submissionInput = null,
}: {
  source: ExaminationSource | null
  submissionInput?: ExaminationPrepareSubmissionSourceInput | null
  emptyBlocker: string | null
}): ExaminationEngineViewModel {
  const workflowClient = useWorkflowClient()
  const controller = useSessionController()
  const rendererHost = useRendererHost()
  const addToast = useToastStore((state) => state.addToast)
  const openSettings = useUiStore((state) => state.openSettings)
  const preferenceSnapshot = useExaminationPreferenceSnapshot()
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const analysisSourceKey = useMemo(
    () => analysisSourceKeyFromSurface(activeSurface),
    [activeSurface],
  )

  const sourceSummaryKey = useMemo(
    () =>
      source === null ? null : buildSourceSummaryKey(source, analysisSourceKey),
    [analysisSourceKey, source],
  )
  const sourceSummary = useExaminationStore(
    selectExaminationSourceSummary(sourceSummaryKey),
  )
  const sourceSubjectIds = useMemo(
    () =>
      source === null
        ? []
        : sourceSubjects(source).map((subject) => subject.id),
    [source],
  )
  const defaultSubjectId =
    source?.kind === "submission"
      ? source.subject.id
      : (source?.subjects[0]?.id ?? null)
  const selectedSubjectId =
    source?.kind === "submission"
      ? source.subject.id
      : (sourceSummary?.selectedSubjectId ?? defaultSubjectId)
  const selectedSubject = useMemo(
    () =>
      source === null ? null : getSourceSubject(source, selectedSubjectId),
    [source, selectedSubjectId],
  )
  useEffect(() => {
    if (defaultSubjectId === null || sourceSummaryKey === null) return
    useExaminationStore.getState().activateSourceSummary({
      sourceSummaryKey,
      subjectIds: sourceSubjectIds,
      selectedSubjectId: selectedSubjectId ?? defaultSubjectId,
    })
  }, [defaultSubjectId, selectedSubjectId, sourceSubjectIds, sourceSummaryKey])
  const defaultModelCode = useMemo(() => {
    const provider = preferenceSnapshot.activeConnection?.provider ?? null
    return provider === null
      ? null
      : resolveExaminationModelCode(
          provider,
          preferenceSnapshot.examinationModelsByProvider,
        )
  }, [
    preferenceSnapshot.activeConnection,
    preferenceSnapshot.examinationModelsByProvider,
  ])
  const defaultModelSpec =
    defaultModelCode === null ? null : (getSpecByCode(defaultModelCode) ?? null)
  const rootQuestionCount = useExaminationStore((state) => state.questionCount)

  const provisionalIdentity = useMemo<SourceIdentity | null>(() => {
    if (
      source === null ||
      selectedSubject === null ||
      defaultModelCode === null ||
      defaultModelSpec === null
    ) {
      return null
    }
    return buildSourceIdentity({
      source,
      subject: selectedSubject,
      questionCount: rootQuestionCount,
      model: defaultModelCode,
      effort: defaultModelSpec.effort,
    })
  }, [
    defaultModelCode,
    defaultModelSpec,
    rootQuestionCount,
    selectedSubject,
    source,
  ])
  const sourceSessionKey = useMemo(
    () =>
      provisionalIdentity === null
        ? null
        : buildSourceSessionKey(provisionalIdentity, analysisSourceKey),
    [analysisSourceKey, provisionalIdentity],
  )
  const session = useExaminationStore(
    selectExaminationSession(sourceSessionKey),
  )
  const activeConnection = resolveActiveConnection(
    preferenceSnapshot,
    session?.preferences.activeConnectionId ?? null,
  )
  const selectedModelCode = useMemo(() => {
    const provider = activeConnection?.provider ?? null
    if (provider === null) return null
    const sessionModel = session?.preferences.modelCode ?? null
    if (sessionModel !== null) {
      const spec = getSpecByCode(sessionModel)
      if (spec !== undefined && spec.provider === provider) return sessionModel
    }
    return resolveExaminationModelCode(
      provider,
      preferenceSnapshot.examinationModelsByProvider,
    )
  }, [
    activeConnection,
    preferenceSnapshot.examinationModelsByProvider,
    session?.preferences.modelCode,
  ])
  const selectedModelSpec =
    selectedModelCode === null
      ? null
      : (getSpecByCode(selectedModelCode) ?? null)
  const questionCount = session?.preferences.questionCount ?? rootQuestionCount
  const rootShowAnswers = useExaminationStore((state) => state.showAnswers)
  const showAnswers = session?.showAnswers ?? rootShowAnswers

  const sourceIdentity = useMemo<SourceIdentity | null>(() => {
    if (
      source === null ||
      selectedSubject === null ||
      selectedModelCode === null ||
      selectedModelSpec === null
    ) {
      return null
    }
    return buildSourceIdentity({
      source,
      subject: selectedSubject,
      questionCount,
      model: selectedModelCode,
      effort: selectedModelSpec.effort,
    })
  }, [
    questionCount,
    selectedModelCode,
    selectedModelSpec,
    selectedSubject,
    source,
  ])

  useEffect(() => {
    if (
      sourceSummaryKey === null ||
      sourceSessionKey === null ||
      sourceIdentity === null ||
      selectedSubject === null ||
      defaultSubjectId === null
    ) {
      return
    }
    useExaminationStore.getState().activateSource({
      sourceSummaryKey,
      sourceSessionKey,
      sourceIdentity,
      subjectIds: sourceSubjectIds,
      selectedSubjectId: selectedSubject.id,
      defaultPreferences: {
        questionCount,
        activeConnectionId: activeConnection?.id ?? null,
        modelCode: selectedModelCode,
        effort: selectedModelSpec?.effort ?? null,
      },
    })
  }, [
    activeConnection,
    defaultSubjectId,
    questionCount,
    selectedModelCode,
    selectedModelSpec,
    selectedSubject,
    sourceIdentity,
    sourceSessionKey,
    sourceSubjectIds,
    sourceSummaryKey,
  ])

  const readLlmSettings = useCallback(() => {
    const preferences = selectExaminationPreferenceSnapshot(
      controller.getSnapshot(),
    )
    const currentSession = selectExaminationSession(sourceSessionKey)(
      useExaminationStore.getState(),
    )
    const connection = resolveActiveConnection(
      preferences,
      currentSession?.preferences.activeConnectionId ?? null,
    )
    const provider = connection?.provider ?? null
    return {
      llmConnections: preferences.connections,
      activeLlmConnectionId: connection?.id ?? null,
      examinationModelsByProvider:
        provider !== null && selectedModelCode !== null
          ? {
              ...preferences.examinationModelsByProvider,
              [provider]: selectedModelCode,
            }
          : preferences.examinationModelsByProvider,
    }
  }, [controller, selectedModelCode, sourceSessionKey])

  const readLookupInput = useCallback(() => {
    if (source === null || selectedSubject === null || sourceIdentity === null)
      return null
    return buildLookupInput(
      source,
      selectedSubject,
      questionCount,
      readLlmSettings(),
    )
  }, [source, selectedSubject, sourceIdentity, questionCount, readLlmSettings])
  const summaryInput = useMemo(
    () => (source === null ? null : buildSummaryInput(source)),
    [source],
  )

  const prepareLookupContext = useCallback(
    async (
      scope: SessionOperationScope,
    ): Promise<ExaminationLookupContext | null> => {
      const preparedSource =
        submissionInput === null
          ? source
          : await prepareSubmissionSource(scope, submissionInput)
      if (
        preparedSource === null ||
        selectedModelCode === null ||
        selectedModelSpec === null
      )
        return null
      const subject = getSourceSubject(preparedSource, selectedSubjectId)
      if (subject === null) return null
      const identity = buildSourceIdentity({
        source: preparedSource,
        subject,
        questionCount,
        model: selectedModelCode,
        effort: selectedModelSpec.effort,
      })
      const sessionKey = buildSourceSessionKey(identity, analysisSourceKey)
      const summaryKey = buildSourceSummaryKey(
        preparedSource,
        analysisSourceKey,
      )
      scope.publish(() =>
        useExaminationStore.getState().activateSourceForRequest({
          sourceSummaryKey: summaryKey,
          sourceSessionKey: sessionKey,
          sourceIdentity: identity,
          subjectIds: sourceSubjects(preparedSource).map((item) => item.id),
          selectedSubjectId: subject.id,
          defaultPreferences: {
            questionCount,
            activeConnectionId: activeConnection?.id ?? null,
            modelCode: selectedModelCode,
            effort: selectedModelSpec.effort,
          },
        }),
      )
      return {
        source: preparedSource,
        selectedSubject: subject,
        sourceIdentity: identity,
        sourceSessionKey: sessionKey,
        sourceSummaryKey: summaryKey,
        analysisSourceKey,
        lookupInput: buildLookupInput(
          preparedSource,
          subject,
          questionCount,
          readLlmSettings(),
        ),
        summaryInput: buildSummaryInput(preparedSource),
      }
    },
    [
      submissionInput,
      source,
      selectedModelCode,
      selectedModelSpec,
      selectedSubjectId,
      questionCount,
      analysisSourceKey,
      activeConnection,
      readLlmSettings,
    ],
  )

  const blocker =
    source === null
      ? (emptyBlocker ??
        (activeConnection === null
          ? "Configure an LLM connection in Settings."
          : null))
      : selectedSubject === null
        ? emptyBlocker
        : resolveExaminationBlockingReason({
            selectedRepositoryPath:
              source.kind === "repository-analysis"
                ? source.selectedRepoPath
                : source.folderPath,
            commitOid:
              source.kind === "repository-analysis"
                ? source.commitOid
                : source.contentScopeId,
            hasActiveLlmConnection: activeConnection !== null,
          })

  const entriesByKey = useExaminationStore((state) => state.entriesByKey)
  const archiveEntries = session?.archiveEntries ?? []
  const display = selectExaminationDisplay({
    displayedState:
      session?.display.kind === "archived" &&
      session.display.source === "lookup" &&
      session.lookupMetadata?.archiveKeyIdentityKey !==
        buildArchiveKeyIdentityKey(sourceIdentity, analysisSourceKey)
        ? { kind: "idle" }
        : (session?.display ?? { kind: "idle" }),
    entriesByKey,
    archiveEntries,
    blocker,
  })
  const showArchiveSelector =
    archiveEntries.length > 1 ||
    (archiveEntries.length === 1 &&
      archiveEntries[0]?.key !== display.archiveEntry?.key)

  const runPreferenceEffects = useCallback(
    (effects: ExaminationPreferencePersistenceEffect[]) => {
      for (const effect of effects) {
        if (effect.activeConnectionId !== undefined) {
          examinationPreferencePersistence.persistActiveConnection(
            effect.activeConnectionId,
          )
        }
        if (effect.providerModel !== undefined) {
          examinationPreferencePersistence.persistModel(
            effect.providerModel.provider,
            effect.providerModel.modelCode,
          )
        }
      }
    },
    [],
  )

  const exportArchive = useCallback(async () => {
    await workflowClient.execute(
      "examination.archive.export",
      async (scope) => {
        try {
          const saveTarget = await scope.direct("pickSaveTarget", () =>
            rendererHost.pickSaveTarget({
              suggestedName: `examinations-${formatDateStamp()}.json`,
              defaultFormat: "json",
            }),
          )
          if (!saveTarget) return
          const summary = await scope.run(
            "examination.archive.export",
            saveTarget,
          )
          addToast(
            `Exported ${summary.recordCount} examination record${
              summary.recordCount === 1 ? "" : "s"
            }.`,
            { tone: "success" },
          )
        } catch (error) {
          addToast(`Export failed: ${getErrorMessage(error)}`, {
            tone: "error",
          })
        }
      },
    )
  }, [addToast, rendererHost, workflowClient])

  const importArchive = useCallback(async () => {
    await workflowClient.execute(
      "examination.archive.import",
      async (scope) => {
        try {
          const file = await scope.direct("pickUserFile", () =>
            rendererHost.pickUserFile({ acceptFormats: ["json"] }),
          )
          if (!file) return
          const lookupInput = readLookupInput()
          const summary = await scope.run("examination.archive.import", file, {
            settlementInput: {
              summaries: summaryInput ?? { subjects: [] },
              questions: lookupInput === null ? [] : [lookupInput],
            },
            applyAuthoritative(values) {
              useExaminationStore.getState().archiveCatalogChanged()
              if (
                lookupInput !== null &&
                sourceSessionKey !== null &&
                sourceIdentity !== null
              ) {
                const result = values.questions[0]
                const started = useExaminationStore
                  .getState()
                  .startLookup(sourceSessionKey)
                if (!result || !started)
                  throw new Error(
                    "The archive lookup publication has no active owner.",
                  )
                applyLookupPublication(
                  structuredClone(result) as ExaminationLookupQuestionsResult,
                  sourceSessionKey,
                  sourceIdentity,
                  analysisSourceKey,
                  started,
                )
              }
              if (summaryInput !== null && sourceSummaryKey !== null) {
                const started = useExaminationStore
                  .getState()
                  .startSourceSummaryLookup(sourceSummaryKey)
                if (!started)
                  throw new Error(
                    "The archive summary publication has no active owner.",
                  )
                applySummaryPublication(
                  structuredClone(
                    values.questionSummaries,
                  ) as ExaminationLookupQuestionSummariesResult,
                  sourceSummaryKey,
                  started,
                )
              }
            },
          })
          addToast(
            `Imported: ${summary.inserted} new, ${summary.updated} updated, ${summary.skipped} skipped${
              summary.rejected > 0 ? `, ${summary.rejected} rejected` : ""
            }.`,
            { tone: "success" },
          )
        } catch (error) {
          addToast(`Import failed: ${getErrorMessage(error)}`, {
            tone: "error",
          })
        }
      },
    )
  }, [
    addToast,
    rendererHost,
    workflowClient,
    analysisSourceKey,
    sourceSessionKey,
    sourceIdentity,
    sourceSummaryKey,
    summaryInput,
    readLookupInput,
  ])

  const changeQuestionCount = useCallback(
    (count: number) => {
      if (sourceSessionKey === null) {
        useExaminationStore.getState().setQuestionCount(count)
        return
      }
      useExaminationStore
        .getState()
        .setSessionQuestionCount(sourceSessionKey, count)
    },
    [sourceSessionKey],
  )

  const changeShowAnswers = useCallback(
    (show: boolean) => {
      if (sourceSessionKey === null) {
        useExaminationStore.getState().setShowAnswers(show)
        return
      }
      useExaminationStore
        .getState()
        .setSessionShowAnswers(sourceSessionKey, show)
    },
    [sourceSessionKey],
  )

  const selectConnection = useCallback(
    (id: string) => {
      const connection =
        preferenceSnapshot.connections.find(
          (candidate) => candidate.id === id,
        ) ?? null
      if (sourceSessionKey === null) {
        examinationPreferencePersistence.persistActiveConnection(id)
        return
      }
      const nextModelCode =
        connection === null
          ? null
          : selectedModelSpec?.provider === connection.provider
            ? selectedModelCode
            : resolveExaminationModelCode(
                connection.provider,
                preferenceSnapshot.examinationModelsByProvider,
              )
      const nextModelSpec =
        nextModelCode === null ? null : (getSpecByCode(nextModelCode) ?? null)
      runPreferenceEffects(
        useExaminationStore
          .getState()
          .setSessionConnection(
            sourceSessionKey,
            id,
            nextModelCode,
            nextModelSpec?.effort ?? null,
          ),
      )
    },
    [
      preferenceSnapshot.connections,
      preferenceSnapshot.examinationModelsByProvider,
      runPreferenceEffects,
      selectedModelCode,
      selectedModelSpec,
      sourceSessionKey,
    ],
  )

  const selectModelCode = useCallback(
    (code: string) => {
      const spec = getSpecByCode(code)
      if (spec === undefined) return
      if (sourceSessionKey === null) {
        examinationPreferencePersistence.persistModel(spec.provider, code)
        return
      }
      runPreferenceEffects(
        useExaminationStore
          .getState()
          .setSessionModel(sourceSessionKey, spec.provider, code, spec.effort),
      )
    },
    [runPreferenceEffects, sourceSessionKey],
  )

  const selectArchiveEntry = useCallback(
    (archiveEntry: AvailableArchiveEntry) => {
      if (sourceSessionKey === null || sourceIdentity === null) return
      const spec = getSpecByCode(archiveEntry.model)
      if (spec === undefined) return
      const matchingConnection =
        activeConnection?.provider === spec.provider
          ? activeConnection
          : (preferenceSnapshot.connections.find(
              (connection) => connection.provider === spec.provider,
            ) ?? null)
      const activeConnectionId = matchingConnection?.id ?? null
      runPreferenceEffects(
        useExaminationStore.getState().selectArchiveEntry(
          sourceSessionKey,
          {
            ...sourceIdentity,
            questionCount: archiveEntry.questionCount,
            model: archiveEntry.model,
            effort: archiveEntry.effort,
          },
          archiveEntry,
          activeConnectionId,
          spec.provider,
        ),
      )
    },
    [
      activeConnection,
      preferenceSnapshot.connections,
      runPreferenceEffects,
      sourceIdentity,
      sourceSessionKey,
    ],
  )

  const generateForSelected = useCallback(
    async (options?: { regenerate?: boolean }) => {
      if (selectedModelCode === null || selectedModelSpec === null) return
      if (blocker !== null) {
        addToast(blocker, { tone: "warning" })
        return
      }
      await workflowClient.execute(
        "examination.generateQuestions",
        async (scope) => {
          let context: ExaminationLookupContext | null
          try {
            context = await prepareLookupContext(scope)
            if (context === null) return
            await refreshExaminationLookup(scope, context, addToast, true)
          } catch (error) {
            if (!scope.signal.aborted)
              addToast(getErrorMessage(error), { tone: "error" })
            return
          }
          const {
            source,
            selectedSubject,
            sourceIdentity,
            sourceSessionKey,
            sourceSummaryKey,
          } = context
          if (selectedSubject.excerpts.length === 0) {
            addToast(
              "No code is attributed to this subject; nothing to generate.",
              { tone: "warning" },
            )
            return
          }
          const state = useExaminationStore.getState()
          const currentSession = state.sourceSessions.get(sourceSessionKey)
          const display = selectExaminationDisplay({
            displayedState: currentSession?.display ?? { kind: "idle" },
            entriesByKey: state.entriesByKey,
            archiveEntries: currentSession?.archiveEntries ?? [],
            blocker,
          })
          const generationPlan = resolveExaminationGenerationPlan({
            display: {
              archiveEntry: display.archiveEntry,
              displayEntry: display.displayEntry,
            },
            modelCode: selectedModelCode,
            effort: selectedModelSpec.effort,
            questionCount,
            regenerate: options?.regenerate ?? false,
          })
          if (generationPlan.additionalQuestionCount < 1) {
            addToast(
              `This set already has the maximum ${EXAMINATION_QUESTION_COUNT_MAX} examination questions.`,
              { tone: "warning" },
            )
            return
          }
          if (generationPlan.capped) {
            addToast(
              `Generation is capped at ${EXAMINATION_QUESTION_COUNT_MAX} total questions, so only ${generationPlan.additionalQuestionCount} additional question${
                generationPlan.additionalQuestionCount === 1 ? "" : "s"
              } will be generated.`,
              { tone: "warning" },
            )
          }
          const metadata = currentSession?.lookupMetadata ?? null
          const loadingKey =
            metadata?.archiveKeyIdentityKey ===
              buildArchiveKeyIdentityKey(sourceIdentity, analysisSourceKey) &&
            generationPlan.targetQuestionCount === questionCount
              ? metadata.entryKey
              : `session-${createUuid()}`
          const workflowInput: ExaminationGenerateQuestionsInput = {
            personId: selectedSubject.id,
            contentScopeId:
              source.kind === "repository-analysis"
                ? source.commitOid
                : source.contentScopeId,
            localIdentityContext: source.localIdentityContext,
            excerpts: selectedSubject.excerpts,
            excerptFileSources: selectedSubject.excerptFileSources,
            questionCount: generationPlan.targetQuestionCount,
            llmSettings: readLlmSettings(),
            ...(generationPlan.seedQuestions.length > 0
              ? { seedQuestions: generationPlan.seedQuestions }
              : {}),
            ...(options?.regenerate ? { regenerate: true } : {}),
          }
          const started = useExaminationStore
            .getState()
            .startGenerationSession({
              sourceSessionKey,
              entryKey: loadingKey,
              seedQuestions: generationPlan.seedQuestions,
              sourceReferences: generationPlan.sourceReferences,
              requestedQuestionCount: generationPlan.targetQuestionCount,
            })
          if (started === null) return

          try {
            const result = await scope.run(
              "examination.generateQuestions",
              workflowInput,
              {
                onProgress: (progress: MilestoneProgress) => {
                  useExaminationStore
                    .getState()
                    .applyGenerationProgress(
                      loadingKey,
                      progress.label,
                      sourceSessionKey,
                      started.requestId,
                    )
                },
                onOutput: (output: ExaminationGenerateOutput) => {
                  if (output.kind === "warn") {
                    addToast(output.message, {
                      tone: "warning",
                      durationMs: 6000,
                    })
                    return
                  }
                  if (output.kind === "stream-progress") {
                    useExaminationStore
                      .getState()
                      .applyStreamProgress(
                        loadingKey,
                        output,
                        sourceSessionKey,
                        started.requestId,
                      )
                    return
                  }
                  useExaminationStore.getState().applyPartialQuestions(
                    loadingKey,
                    {
                      questions: output.questions,
                      sourceReferences: output.sourceReferences,
                    },
                    sourceSessionKey,
                    started.requestId,
                  )
                },
              },
            )
            const archiveKey = serializeExaminationArchiveStorageKey(result.key)
            const loadedEntry = toExaminationEntry(result)
            useExaminationStore.getState().applyLoadedArchiveResult({
              sourceSummaryKey,
              sourceSessionKey,
              requestId: started.requestId,
              loadingKey,
              resultKey: archiveKey,
              entry: loadedEntry,
              archiveEntry: {
                key: archiveKey,
                questionCount: result.archivedProvenance.questionCount,
                model: result.archivedProvenance.model,
                effort: result.archivedProvenance.effort,
                entry: loadedEntry,
              },
            })
          } catch (error) {
            const message = getErrorMessage(error)
            useExaminationStore
              .getState()
              .applyGenerationError(
                loadingKey,
                message,
                sourceSessionKey,
                started.requestId,
              )
          }
        },
      )
    },
    [
      addToast,
      blocker,
      readLlmSettings,
      prepareLookupContext,
      questionCount,
      selectedModelCode,
      selectedModelSpec,
      workflowClient,
      analysisSourceKey,
    ],
  )

  const stopGeneration = useCallback(() => {
    if (sourceSessionKey !== null)
      useExaminationStore.getState().requestGenerationStop(sourceSessionKey)
    workflowClient.stop("examination.generateQuestions")
  }, [sourceSessionKey, workflowClient])

  const loadQuestions = useCallback(async () => {
    if (blocker !== null) return
    await workflowClient.execute(
      "examination.lookupQuestions",
      async (scope) => {
        try {
          const context = await prepareLookupContext(scope)
          if (context === null) return
          await refreshExaminationLookup(scope, context, addToast, false)
          await refreshExaminationSummary(scope, context)
        } catch (error) {
          if (!scope.signal.aborted)
            addToast(getErrorMessage(error), { tone: "error" })
        }
      },
    )
  }, [workflowClient, blocker, prepareLookupContext, addToast])

  const copyMarkdown = useCallback(async () => {
    if (
      selectedSubject === null ||
      display.archiveEntry === null ||
      display.displayEntry === null
    ) {
      return
    }
    const markdown = buildMarkdownTranscript({
      authorName: selectedSubject.name,
      authorEmail: selectedSubject.email,
      questions: display.displayEntry.questions,
      sourceReferences: display.displayEntry.sourceReferences,
    })
    try {
      await navigator.clipboard.writeText(markdown)
      addToast("Copied question set to clipboard.", { tone: "success" })
    } catch (_error) {
      addToast("Clipboard copy failed.", { tone: "error" })
    }
  }, [addToast, display.archiveEntry, display.displayEntry, selectedSubject])

  return {
    subjects: source === null ? [] : sourceSubjects(source),
    selectedSubject,
    generatedQuestionCountBySubjectId:
      sourceSummary?.generatedQuestionCountBySubjectId ?? EMPTY_COUNTS,
    connections: preferenceSnapshot.connections,
    activeConnection,
    selectedModelCode,
    archiveEntries,
    showArchiveSelector,
    display,
    questionCount,
    showAnswers,
    blocker,
    isGenerating: useSessionControllerSelector((state) =>
      selectOperationIsAdmitted(state, "examination.generateQuestions"),
    ),
    hasLoadedQuestions:
      session?.lookupMetadata !== null && session?.lookupMetadata !== undefined,
    rosterWarning:
      source?.kind === "repository-analysis" && selectedSubject !== null
        ? (source.rosterWarningBySubjectId.get(selectedSubject.id) ?? null)
        : null,
    commands: {
      selectSubject: (subjectId) =>
        sourceSummaryKey !== null &&
        useExaminationStore
          .getState()
          .selectRepositoryAnalysisSubject(sourceSummaryKey, subjectId),
      selectConnection,
      selectModelCode,
      openLlmSettings: () => openSettings("llm-connections"),
      importArchive: () => void importArchive(),
      exportArchive: () => void exportArchive(),
      changeQuestionCount,
      changeShowAnswers,
      selectArchiveEntry,
      loadQuestions: () => void loadQuestions(),
      generate: () => void generateForSelected(),
      stopGeneration,
      regenerate: () => void generateForSelected({ regenerate: true }),
      copyMarkdown: () => void copyMarkdown(),
    },
  }
}

function buildSourceIdentity(params: {
  source: ExaminationSource
  subject: PreparedExaminationSubject
  questionCount: number
  model: string
  effort: NonNullable<SourceIdentity["effort"]>
}): SourceIdentity {
  if (params.source.kind === "repository-analysis") {
    return buildRepositoryAnalysisSourceIdentity({
      source: params.source,
      subject: params.subject,
      questionCount: params.questionCount,
      model: params.model,
      effort: params.effort,
    })
  }
  return buildSubmissionSourceIdentity({
    source: params.source,
    questionCount: params.questionCount,
    model: params.model,
    effort: params.effort,
  })
}

function formatDateStamp(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

function createUuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  )
}
