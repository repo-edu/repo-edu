import type {
  ExaminationGenerateOutput,
  ExaminationGenerateQuestionsInput,
  ExaminationLookupQuestionsInput,
  ExaminationQuestionSummarySubjectInput,
  MilestoneProgress,
} from "@repo-edu/application-contract"
import { serializeExaminationArchiveStorageKey } from "@repo-edu/application-contract"
import { getSpecByCode } from "@repo-edu/integrations-llm-catalog"
import { useCallback, useEffect, useMemo } from "react"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  type ExaminationPreferenceSnapshot,
  examinationPreferencePersistence,
  useExaminationPreferenceSnapshot,
} from "../../../stores/examination-preferences.js"
import {
  type ExaminationGenerationReplayInput,
  type ExaminationHistoryEffect,
  type ExaminationPreferencePersistenceEffect,
  examinationHistoryEffectDriver,
  examinationRequestSidecar,
  selectExaminationSession,
  selectExaminationSourceSummary,
  useExaminationStore,
} from "../../../stores/examination-store.js"
import { useToastStore } from "../../../stores/toast-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import {
  toAvailableArchiveEntry,
  toExaminationEntry,
} from "./archive-entries.js"
import {
  type ExaminationDisplaySelection,
  selectExaminationDisplay,
} from "./display-selectors.js"
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
    generate: () => void
    stopGeneration: () => void
    regenerate: () => void
    copyMarkdown: () => void
  }
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map()

export function useExaminationEngine({
  source,
  emptyBlocker,
}: {
  source: ExaminationSource
  emptyBlocker: string | null
}): ExaminationEngineViewModel {
  const workflowClient = useWorkflowClient()
  const rendererHost = useRendererHost()
  const addToast = useToastStore((state) => state.addToast)
  const openSettings = useUiStore((state) => state.openSettings)
  const preferenceSnapshot = useExaminationPreferenceSnapshot()

  const sourceSummaryKey = useMemo(
    () => buildSourceSummaryKey(source),
    [source],
  )
  const sourceSummary = useExaminationStore(
    selectExaminationSourceSummary(sourceSummaryKey),
  )
  const sourceSubjectIds = useMemo(
    () => sourceSubjects(source).map((subject) => subject.id),
    [source],
  )
  const defaultSubjectId =
    source.kind === "submission"
      ? source.subject.id
      : (source.subjects[0]?.id ?? null)
  const selectedSubjectId =
    source.kind === "submission"
      ? source.subject.id
      : (sourceSummary?.selectedSubjectId ?? defaultSubjectId)
  const selectedSubject = useMemo(
    () => getSourceSubject(source, selectedSubjectId),
    [source, selectedSubjectId],
  )
  useEffect(() => {
    if (defaultSubjectId === null) return
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
        : buildSourceSessionKey(provisionalIdentity),
    [provisionalIdentity],
  )
  const session = useExaminationStore(
    selectExaminationSession(sourceSessionKey),
  )
  const activeConnection = useMemo(() => {
    const preferredId = session?.preferences.activeConnectionId ?? null
    return (
      preferenceSnapshot.connections.find(
        (connection) => connection.id === preferredId,
      ) ??
      preferenceSnapshot.activeConnection ??
      null
    )
  }, [
    preferenceSnapshot.activeConnection,
    preferenceSnapshot.connections,
    session?.preferences.activeConnectionId,
  ])
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

  const archiveRevision = useExaminationStore((state) => state.archiveRevision)

  const llmSettings = useMemo(() => {
    const provider = activeConnection?.provider ?? null
    return {
      llmConnections: preferenceSnapshot.connections,
      activeLlmConnectionId: activeConnection?.id ?? null,
      examinationModelsByProvider:
        provider !== null && selectedModelCode !== null
          ? {
              ...preferenceSnapshot.examinationModelsByProvider,
              [provider]: selectedModelCode,
            }
          : preferenceSnapshot.examinationModelsByProvider,
    }
  }, [
    activeConnection,
    preferenceSnapshot.connections,
    preferenceSnapshot.examinationModelsByProvider,
    selectedModelCode,
  ])

  const lookupInput = useMemo<ExaminationLookupQuestionsInput | null>(() => {
    if (selectedSubject === null || sourceIdentity === null) return null
    return {
      personId: selectedSubject.id,
      contentScopeId:
        source.kind === "repository-analysis"
          ? source.commitOid
          : source.contentScopeId,
      localIdentityContext: source.localIdentityContext,
      excerpts: selectedSubject.excerpts,
      excerptFileSources: selectedSubject.excerptFileSources,
      questionCount,
      llmSettings,
    }
  }, [llmSettings, questionCount, selectedSubject, source, sourceIdentity])

  useEffect(() => {
    void archiveRevision
    if (
      sourceSessionKey === null ||
      sourceIdentity === null ||
      lookupInput === null
    ) {
      return
    }
    const started = useExaminationStore.getState().startLookup(sourceSessionKey)
    if (started === null) return
    const abort = new AbortController()
    examinationRequestSidecar.registerLookup(
      sourceSessionKey,
      started.requestId,
      abort,
    )
    workflowClient
      .run("examination.lookupQuestions", lookupInput, {
        signal: abort.signal,
        onProgress: (_progress: MilestoneProgress) => undefined,
      })
      .then((result) => {
        if (abort.signal.aborted) return
        const entryKey = serializeExaminationArchiveStorageKey(
          result.requestedKey,
        )
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
          requestedIdentity: sourceIdentity,
          resolvedIdentity,
          entryKey,
          exactEntry:
            result.exact === null ? null : toExaminationEntry(result.exact),
          archiveEntries: result.availableSets.map((questionSet) =>
            toAvailableArchiveEntry(questionSet),
          ),
        })
      })
      .catch((_error: unknown) => {
        if (!abort.signal.aborted) {
          useExaminationStore
            .getState()
            .failLookup(sourceSessionKey, started.requestId)
        }
      })
      .finally(() => {
        examinationRequestSidecar.clearLookup(
          sourceSessionKey,
          started.requestId,
        )
      })
    return () => abort.abort()
  }, [
    archiveRevision,
    lookupInput,
    sourceIdentity,
    sourceSessionKey,
    workflowClient,
  ])

  const summaryInput = useMemo(() => {
    if (source.kind !== "repository-analysis") return null
    const subjects: ExaminationQuestionSummarySubjectInput[] = source.subjects
      .filter((subject) => subject.excerpts.length > 0)
      .map((subject) => ({
        subjectId: subject.id,
        personId: subject.id,
        contentScopeId: source.commitOid,
        localIdentityContext: source.localIdentityContext,
        excerpts: subject.excerpts,
        excerptFileSources: subject.excerptFileSources,
      }))
    return subjects.length === 0 ? null : { subjects }
  }, [source])

  useEffect(() => {
    void archiveRevision
    if (summaryInput === null || source.kind !== "repository-analysis") return
    const started = useExaminationStore
      .getState()
      .startSourceSummaryLookup(sourceSummaryKey)
    if (started === null) return
    const abort = new AbortController()
    examinationRequestSidecar.registerSummary(
      sourceSummaryKey,
      started.requestId,
      abort,
    )
    workflowClient
      .run("examination.lookupQuestionSummaries", summaryInput, {
        signal: abort.signal,
        onProgress: (_progress: MilestoneProgress) => undefined,
      })
      .then((result) => {
        if (abort.signal.aborted) return
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
      })
      .catch((_error: unknown) => {
        if (!abort.signal.aborted) {
          useExaminationStore
            .getState()
            .failSourceSummaryLookup(sourceSummaryKey, started.requestId)
        }
      })
      .finally(() => {
        examinationRequestSidecar.clearSummary(
          sourceSummaryKey,
          started.requestId,
        )
      })
    return () => abort.abort()
  }, [archiveRevision, source, sourceSummaryKey, summaryInput, workflowClient])

  const blocker =
    selectedSubject === null
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
    displayedState: session?.display ?? { kind: "idle" },
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
    const saveTarget = await rendererHost.pickSaveTarget({
      suggestedName: `examinations-${formatDateStamp()}.json`,
      defaultFormat: "json",
    })
    if (!saveTarget) return
    try {
      const summary = await workflowClient.run(
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
      addToast(`Export failed: ${getErrorMessage(error)}`, { tone: "error" })
    }
  }, [addToast, rendererHost, workflowClient])

  const importArchive = useCallback(async () => {
    const file = await rendererHost.pickUserFile({ acceptFormats: ["json"] })
    if (!file) return
    try {
      const summary = await workflowClient.run(
        "examination.archive.import",
        file,
      )
      addToast(
        `Imported: ${summary.inserted} new, ${summary.updated} updated, ${summary.skipped} skipped${
          summary.rejected > 0 ? `, ${summary.rejected} rejected` : ""
        }.`,
        { tone: "success" },
      )
      useExaminationStore.getState().archiveCatalogChanged()
    } catch (error) {
      addToast(`Import failed: ${getErrorMessage(error)}`, { tone: "error" })
    }
  }, [addToast, rendererHost, workflowClient])

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
      if (sourceSessionKey === null) {
        examinationPreferencePersistence.persistActiveConnection(id)
        return
      }
      runPreferenceEffects(
        useExaminationStore
          .getState()
          .setSessionConnection(sourceSessionKey, id),
      )
    },
    [runPreferenceEffects, sourceSessionKey],
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

  const runGeneration = useCallback(
    async (params: {
      loadingKey: string
      replayInput: ExaminationGenerationReplayInput
    }) => {
      const generationControlId = `generation-${createUuid()}`
      const runSourceSessionKey = params.replayInput.sourceSessionKey
      const seedQuestions = params.replayInput.workflowInput.seedQuestions ?? []
      const started = useExaminationStore.getState().startGenerationSession({
        sourceSessionKey: runSourceSessionKey,
        entryKey: params.loadingKey,
        generationControlId,
        seedQuestions,
        sourceReferences: params.replayInput.sourceReferences,
        requestedQuestionCount: params.replayInput.requestedQuestionCount,
        generationReplayInput: params.replayInput,
      })
      if (started === null) return
      const abort = new AbortController()
      examinationRequestSidecar.registerGeneration(
        runSourceSessionKey,
        started.requestId,
        abort,
        generationControlId,
      )

      try {
        const result = await workflowClient.run(
          "examination.generateQuestions",
          {
            ...params.replayInput.workflowInput,
            generationControlId,
          },
          {
            signal: abort.signal,
            onProgress: (progress: MilestoneProgress) => {
              useExaminationStore
                .getState()
                .applyGenerationProgress(
                  params.loadingKey,
                  progress.label,
                  runSourceSessionKey,
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
                    params.loadingKey,
                    output,
                    runSourceSessionKey,
                    started.requestId,
                  )
                return
              }
              useExaminationStore.getState().applyPartialQuestions(
                params.loadingKey,
                {
                  questions: output.questions,
                  sourceReferences: output.sourceReferences,
                  inProgressQuestion: output.inProgressQuestion,
                },
                runSourceSessionKey,
                started.requestId,
              )
            },
          },
        )
        if (abort.signal.aborted) return
        const archiveKey = serializeExaminationArchiveStorageKey(result.key)
        const loadedEntry = toExaminationEntry(result)
        useExaminationStore.getState().applyLoadedArchiveResult({
          sourceSummaryKey: params.replayInput.sourceSummaryKey,
          sourceSessionKey: runSourceSessionKey,
          requestId: started.requestId,
          loadingKey: params.loadingKey,
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
        if (abort.signal.aborted) return
        const message = getErrorMessage(error)
        useExaminationStore
          .getState()
          .applyGenerationError(
            params.loadingKey,
            message,
            runSourceSessionKey,
            started.requestId,
          )
        addToast(`Question generation failed: ${message}`, { tone: "error" })
      } finally {
        examinationRequestSidecar.clearGeneration(
          runSourceSessionKey,
          started.requestId,
        )
      }
    },
    [addToast, workflowClient],
  )

  useEffect(() => {
    return examinationHistoryEffectDriver.register(
      (effect: ExaminationHistoryEffect) => {
        if (effect.kind !== "replay-generation") return
        void runGeneration({
          loadingKey: `session-${createUuid()}`,
          replayInput: effect.input,
        })
      },
    )
  }, [runGeneration])

  const generateForSelected = useCallback(
    async (options?: { regenerate?: boolean }) => {
      if (
        selectedSubject === null ||
        sourceIdentity === null ||
        sourceSessionKey === null ||
        selectedModelCode === null ||
        selectedModelSpec === null
      ) {
        return
      }
      if (blocker !== null) {
        addToast(blocker, { tone: "warning" })
        return
      }
      if (selectedSubject.excerpts.length === 0) {
        addToast(
          "No code is attributed to this subject; nothing to generate.",
          { tone: "warning" },
        )
        return
      }
      const seedEntry =
        options?.regenerate || display.displayEntry?.status !== "loaded"
          ? null
          : display.displayEntry
      const seedQuestions = seedEntry?.questions ?? []
      const requestedQuestionCount =
        options?.regenerate && display.archiveEntry !== null
          ? display.archiveEntry.questionCount
          : questionCount
      const additionalQuestionCount = Math.min(
        requestedQuestionCount,
        20 - seedQuestions.length,
      )
      if (additionalQuestionCount < 1) {
        addToast("This set already has the maximum 20 examination questions.", {
          tone: "warning",
        })
        return
      }
      if (additionalQuestionCount < requestedQuestionCount) {
        addToast(
          `Generation is capped at 20 total questions, so only ${additionalQuestionCount} additional question${
            additionalQuestionCount === 1 ? "" : "s"
          } will be generated.`,
          { tone: "warning" },
        )
      }
      const targetQuestionCount = seedQuestions.length + additionalQuestionCount
      const metadata = session?.lookupMetadata ?? null
      const loadingKey =
        metadata?.archiveKeyIdentityKey ===
          buildArchiveKeyIdentityKey(sourceIdentity) &&
        targetQuestionCount === questionCount
          ? metadata.entryKey
          : `session-${createUuid()}`
      const workflowInput: Omit<
        ExaminationGenerateQuestionsInput,
        "generationControlId"
      > = {
        personId: selectedSubject.id,
        contentScopeId:
          source.kind === "repository-analysis"
            ? source.commitOid
            : source.contentScopeId,
        localIdentityContext: source.localIdentityContext,
        excerpts: selectedSubject.excerpts,
        excerptFileSources: selectedSubject.excerptFileSources,
        questionCount: targetQuestionCount,
        llmSettings,
        ...(seedQuestions.length > 0 ? { seedQuestions } : {}),
        ...(options?.regenerate ? { regenerate: true } : {}),
      }
      await runGeneration({
        loadingKey,
        replayInput: {
          sourceSummaryKey,
          sourceSessionKey,
          workflowInput,
          sourceReferences: seedEntry?.sourceReferences ?? [],
          requestedQuestionCount: targetQuestionCount,
        },
      })
    },
    [
      addToast,
      blocker,
      display.archiveEntry,
      display.displayEntry,
      llmSettings,
      questionCount,
      selectedModelCode,
      selectedModelSpec,
      selectedSubject,
      session?.lookupMetadata,
      runGeneration,
      source,
      sourceIdentity,
      sourceSessionKey,
      sourceSummaryKey,
    ],
  )

  const stopGeneration = useCallback(() => {
    if (sourceSessionKey === null) return
    const generationControlId = useExaminationStore
      .getState()
      .requestGenerationStop(sourceSessionKey)
    if (generationControlId === null) return
    workflowClient
      .run("examination.stopGeneration", { generationControlId })
      .catch((error: unknown) => {
        addToast(`Stop failed: ${getErrorMessage(error)}`, { tone: "error" })
      })
  }, [addToast, sourceSessionKey, workflowClient])

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
    subjects: sourceSubjects(source),
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
    rosterWarning:
      source.kind === "repository-analysis" && selectedSubject !== null
        ? (source.rosterWarningBySubjectId.get(selectedSubject.id) ?? null)
        : null,
    commands: {
      selectSubject: (subjectId) =>
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}
