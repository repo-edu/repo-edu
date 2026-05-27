import type {
  ExaminationGenerateOutput,
  ExaminationLookupQuestionsInput,
  MilestoneProgress,
} from "@repo-edu/application-contract"
import { serializeExaminationArchiveStorageKey } from "@repo-edu/application-contract"
import {
  getExaminationDefaultSpec,
  getSpecByCode,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import {
  selectActiveLlmConnection,
  selectExaminationModelsByProvider,
  selectLlmConnections,
  useAppSettingsStore,
} from "../../../stores/app-settings-store.js"
import { useExaminationStore } from "../../../stores/examination-store.js"
import { useToastStore } from "../../../stores/toast-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import {
  mergeAvailableArchiveEntries,
  toAvailableArchiveEntry,
  toExaminationEntry,
} from "./archive-entries.js"
import {
  buildExcerptFileSources,
  buildMemberExcerpts,
} from "./build-excerpts.js"
import {
  type ExaminationDisplaySelection,
  selectExaminationDisplay,
} from "./display-selectors.js"
import {
  displayedEntryReducer,
  initialDisplayedEntryReducerState,
  sourceIdentityKey,
} from "./displayed-entry-reducer.js"
import { resolveExaminationModelCode } from "./llm-models.js"
import { buildMarkdownTranscript } from "./markdown-transcript.js"
import type {
  ExaminationSource,
  SourceIdentity,
  SourceSubject,
} from "./source.js"
import {
  buildCourseSourceIdentity,
  buildProvisionalCourseExcerptScopeId,
  buildSubmissionSourceIdentity,
  getSourceSubject,
  sourceSubjects,
} from "./source.js"
import type { AvailableArchiveEntry } from "./types.js"
import { resolveExaminationBlockingReason } from "./view-state.js"

type LookupMetadata = {
  identityKey: string
  entryKey: string
}

export type ExaminationEngineViewModel = {
  subjects: SourceSubject[]
  selectedSubject: SourceSubject | null
  generatedQuestionCountBySubjectId: ReadonlyMap<string, number>
  connections: ReturnType<typeof selectLlmConnections>
  activeConnection: ReturnType<typeof selectActiveLlmConnection>
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
  const selectedSubjectId = useExaminationStore((state) =>
    source.kind === "submission" ? source.subject.id : state.selectedPersonId,
  )
  const setSelectedSubjectId = useExaminationStore(
    (state) => state.setSelectedPersonId,
  )
  const questionCount = useExaminationStore((state) => state.questionCount)
  const setQuestionCount = useExaminationStore(
    (state) => state.setQuestionCount,
  )
  const showAnswers = useExaminationStore((state) => state.showAnswers)
  const setShowAnswers = useExaminationStore((state) => state.setShowAnswers)
  const entriesByKey = useExaminationStore((state) => state.entriesByKey)
  const setEntry = useExaminationStore((state) => state.setEntry)
  const clearEntry = useExaminationStore((state) => state.clearEntry)
  const startGenerationSession = useExaminationStore(
    (state) => state.startGenerationSession,
  )
  const applyLoadedArchiveResult = useExaminationStore(
    (state) => state.applyLoadedArchiveResult,
  )
  const applyGenerationError = useExaminationStore(
    (state) => state.applyGenerationError,
  )
  const applyGenerationProgress = useExaminationStore(
    (state) => state.applyGenerationProgress,
  )
  const applyPartialQuestions = useExaminationStore(
    (state) => state.applyPartialQuestions,
  )
  const applyStreamProgress = useExaminationStore(
    (state) => state.applyStreamProgress,
  )
  const requestGenerationStop = useExaminationStore(
    (state) => state.requestGenerationStop,
  )
  const cancelAllGenerationSessions = useExaminationStore(
    (state) => state.cancelAllGenerationSessions,
  )
  const clearAbort = useExaminationStore((state) => state.clearAbort)

  const llmConnections = useAppSettingsStore(selectLlmConnections)
  const activeLlmConnection = useAppSettingsStore(selectActiveLlmConnection)
  const examinationModelsByProvider = useAppSettingsStore(
    selectExaminationModelsByProvider,
  )
  const setActiveLlmConnectionId = useAppSettingsStore(
    (state) => state.setActiveLlmConnectionId,
  )
  const setExaminationModelForProvider = useAppSettingsStore(
    (state) => state.setExaminationModelForProvider,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const openSettings = useUiStore((state) => state.openSettings)

  const [archiveEntries, setArchiveEntries] = useState<AvailableArchiveEntry[]>(
    [],
  )
  const [generatedQuestionCountBySubjectId, setGeneratedQuestionCount] =
    useState<ReadonlyMap<string, number>>(new Map())
  const [lookupMetadata, setLookupMetadata] = useState<LookupMetadata | null>(
    null,
  )
  const [refreshToken, setRefreshToken] = useState(0)
  const [displayState, dispatchDisplay] = useReducer(
    displayedEntryReducer,
    initialDisplayedEntryReducerState,
  )

  const activeProvider = activeLlmConnection?.provider ?? null
  const llmSettings = useMemo(
    () => ({
      llmConnections,
      activeLlmConnectionId: activeLlmConnection?.id ?? null,
      examinationModelsByProvider,
    }),
    [llmConnections, activeLlmConnection, examinationModelsByProvider],
  )
  const selectedModelCode = useMemo(() => {
    if (activeProvider === null) return null
    return resolveExaminationModelCode(
      activeProvider,
      examinationModelsByProvider,
    )
  }, [activeProvider, examinationModelsByProvider])
  const selectedModelSpec = useMemo(
    () =>
      selectedModelCode === null
        ? null
        : (getSpecByCode(selectedModelCode) ?? null),
    [selectedModelCode],
  )

  useEffect(() => {
    if (activeProvider === null) return
    const persisted = examinationModelsByProvider[activeProvider]
    if (typeof persisted !== "string" || persisted.length === 0) return
    const spec = getSpecByCode(persisted)
    if (spec !== undefined && spec.provider === activeProvider) return
    const fallback = getExaminationDefaultSpec(activeProvider)
    if (fallback === undefined) return
    setExaminationModelForProvider(activeProvider, modelCode(fallback))
    void saveAppSettings()
  }, [
    activeProvider,
    examinationModelsByProvider,
    setExaminationModelForProvider,
    saveAppSettings,
  ])

  const selectedSubject = useMemo(
    () => getSourceSubject(source, selectedSubjectId),
    [source, selectedSubjectId],
  )
  const excerpts = useMemo(() => {
    if (source.kind === "submission") return source.excerpts
    if (selectedSubject === null) return []
    const blameResult = useAnalysisStore.getState().blameResult
    if (blameResult === null) return []
    return buildMemberExcerpts(
      blameResult,
      blameResult.personDbOverlay,
      selectedSubject.id,
    )
  }, [source, selectedSubject])
  const excerptFileSources = useMemo(() => {
    if (source.kind === "submission") return source.excerptFileSources
    const blameResult = useAnalysisStore.getState().blameResult
    if (blameResult === null) return {}
    return buildExcerptFileSources(blameResult, excerpts)
  }, [source, excerpts])
  const sourceIdentity = useMemo<SourceIdentity | null>(() => {
    if (
      selectedSubject === null ||
      selectedModelCode === null ||
      selectedModelSpec === null ||
      excerpts.length === 0
    ) {
      return null
    }
    if (source.kind === "submission") {
      return buildSubmissionSourceIdentity({
        source,
        questionCount,
        model: selectedModelCode,
        effort: selectedModelSpec.effort,
      })
    }
    return buildCourseSourceIdentity({
      source,
      subjectId: selectedSubject.id,
      excerptScopeId: buildProvisionalCourseExcerptScopeId({
        excerpts,
        excerptFileSources,
      }),
      questionCount,
      model: selectedModelCode,
      effort: selectedModelSpec.effort,
    })
  }, [
    excerptFileSources,
    excerpts,
    questionCount,
    selectedModelCode,
    selectedModelSpec,
    selectedSubject,
    source,
  ])
  useEffect(() => {
    dispatchDisplay({ type: "IDENTITY_CHANGED", identity: sourceIdentity })
    setArchiveEntries([])
    setLookupMetadata(null)
    cancelAllGenerationSessions()
  }, [sourceIdentity, cancelAllGenerationSessions])

  useEffect(() => {
    return () => cancelAllGenerationSessions()
  }, [cancelAllGenerationSessions])

  const lookupInput = useMemo<ExaminationLookupQuestionsInput | null>(() => {
    if (
      selectedSubject === null ||
      sourceIdentity === null ||
      excerpts.length === 0
    ) {
      return null
    }
    return {
      personId: selectedSubject.id,
      contentScopeId:
        source.kind === "course" ? source.commitOid : source.contentScopeId,
      localIdentityContext: source.localIdentityContext,
      excerpts,
      excerptFileSources,
      questionCount,
      llmSettings,
    }
  }, [
    excerptFileSources,
    excerpts,
    llmSettings,
    questionCount,
    selectedSubject,
    source,
    sourceIdentity,
  ])

  useEffect(() => {
    if (sourceIdentity === null || lookupInput === null) return
    const abort = new AbortController()
    const requestIdentity = sourceIdentity
    const requestIdentityKey = sourceIdentityKey(requestIdentity)
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
        setLookupMetadata({ identityKey: requestIdentityKey, entryKey })
        const archiveIdentity =
          requestIdentity.kind === "course"
            ? {
                ...requestIdentity,
                excerptScopeId: result.requestedKey.providerPayloadFingerprint,
              }
            : requestIdentity
        if (requestIdentity.kind === "course") {
          dispatchDisplay({
            type: "EXCERPT_SCOPE_RESOLVED",
            provisionalIdentity: requestIdentity,
            resolvedExcerptScopeId:
              result.requestedKey.providerPayloadFingerprint,
          })
        }
        const nextArchiveEntries = result.availableSets.map((questionSet) =>
          toAvailableArchiveEntry(questionSet),
        )
        setArchiveEntries((current) =>
          mergeAvailableArchiveEntries(current, nextArchiveEntries),
        )
        if (result.exact === null) {
          const currentEntry =
            useExaminationStore.getState().entriesByKey.get(entryKey) ?? null
          if (currentEntry !== null && currentEntry.status !== "loading") {
            clearEntry(entryKey)
          }
          dispatchDisplay({ type: "LOOKUP_MISS", identity: archiveIdentity })
          return
        }
        const currentEntry =
          useExaminationStore.getState().entriesByKey.get(entryKey) ?? null
        if (currentEntry?.status !== "loading") {
          setEntry(entryKey, toExaminationEntry(result.exact))
        }
        dispatchDisplay({
          type: "LOOKUP_SUCCESS",
          identity: archiveIdentity,
          exactEntryKey: entryKey,
        })
      })
      .catch((_error: unknown) => undefined)
    return () => abort.abort()
  }, [clearEntry, lookupInput, setEntry, sourceIdentity, workflowClient])

  useEffect(() => {
    void refreshToken
    if (source.kind !== "course") {
      setGeneratedQuestionCount(new Map())
      return
    }
    const abort = new AbortController()
    const courseSource = source
    const subjects = source.subjects
    const blameResult = useAnalysisStore.getState().blameResult
    if (blameResult === null || courseSource.commitOid.length === 0) {
      setGeneratedQuestionCount(new Map())
      return () => abort.abort()
    }
    const inputs = subjects.flatMap((subject) => {
      const subjectExcerpts = buildMemberExcerpts(
        blameResult,
        blameResult.personDbOverlay,
        subject.id,
      )
      if (subjectExcerpts.length === 0) return []
      return [
        {
          subjectId: subject.id,
          personId: subject.id,
          contentScopeId: courseSource.commitOid,
          localIdentityContext: courseSource.localIdentityContext,
          excerpts: subjectExcerpts,
          excerptFileSources: buildExcerptFileSources(
            blameResult,
            subjectExcerpts,
          ),
        },
      ]
    })
    if (inputs.length === 0) {
      setGeneratedQuestionCount(new Map())
      return () => abort.abort()
    }
    workflowClient
      .run(
        "examination.lookupQuestionSummaries",
        { subjects: inputs },
        {
          signal: abort.signal,
          onProgress: (_progress: MilestoneProgress) => undefined,
        },
      )
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
        setGeneratedQuestionCount(counts)
      })
      .catch((_error: unknown) => {
        if (!abort.signal.aborted) setGeneratedQuestionCount(new Map())
      })
    return () => abort.abort()
  }, [refreshToken, source, workflowClient])

  const blocker =
    selectedSubject === null
      ? emptyBlocker
      : resolveExaminationBlockingReason({
          selectedRepositoryPath:
            source.kind === "course"
              ? source.selectedRepoPath
              : source.folderPath,
          commitOid:
            source.kind === "course" ? source.commitOid : source.contentScopeId,
          hasActiveLlmConnection: activeLlmConnection !== null,
        })

  const display = selectExaminationDisplay({
    displayedState: displayState.display,
    entriesByKey,
    archiveEntries,
    blocker,
  })
  const showArchiveSelector =
    archiveEntries.length > 1 ||
    (archiveEntries.length === 1 &&
      archiveEntries[0]?.key !== display.archiveEntry?.key)

  const effectiveIdentityForEvent = useCallback((): SourceIdentity | null => {
    return displayState.identity ?? sourceIdentity
  }, [displayState.identity, sourceIdentity])

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
      addToast(
        `Export failed: ${error instanceof Error ? error.message : String(error)}`,
        { tone: "error" },
      )
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
      setRefreshToken((token) => token + 1)
    } catch (error) {
      addToast(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        { tone: "error" },
      )
    }
  }, [addToast, rendererHost, workflowClient])

  const changeQuestionCount = useCallback(
    (count: number) => {
      dispatchDisplay({ type: "QUESTION_COUNT_CHANGED", identity: null })
      setQuestionCount(count)
    },
    [setQuestionCount],
  )

  const selectConnection = useCallback(
    (id: string) => {
      dispatchDisplay({ type: "MODEL_CHANGED", identity: null })
      setActiveLlmConnectionId(id)
      void saveAppSettings()
    },
    [saveAppSettings, setActiveLlmConnectionId],
  )

  const selectModelCode = useCallback(
    (code: string) => {
      if (activeProvider === null) return
      dispatchDisplay({ type: "MODEL_CHANGED", identity: null })
      setExaminationModelForProvider(activeProvider, code)
      void saveAppSettings()
    },
    [activeProvider, saveAppSettings, setExaminationModelForProvider],
  )

  const selectArchiveEntry = useCallback(
    (archiveEntry: AvailableArchiveEntry) => {
      const spec = getSpecByCode(archiveEntry.model)
      if (spec === undefined) return
      const archiveIdentity = buildArchiveSelectionIdentity({
        currentIdentity: sourceIdentity,
        archiveEntry,
      })
      if (archiveIdentity !== null) {
        dispatchDisplay({
          type: "ARCHIVE_SELECTED",
          identity: archiveIdentity,
          entryKey: archiveEntry.key,
        })
      }
      setQuestionCount(archiveEntry.questionCount)
      const matchingConnection =
        activeLlmConnection?.provider === spec.provider
          ? activeLlmConnection
          : (llmConnections.find(
              (connection) => connection.provider === spec.provider,
            ) ?? null)
      let changed = false
      if (
        matchingConnection !== null &&
        matchingConnection.id !== activeLlmConnection?.id
      ) {
        setActiveLlmConnectionId(matchingConnection.id)
        changed = true
      }
      if (examinationModelsByProvider[spec.provider] !== archiveEntry.model) {
        setExaminationModelForProvider(spec.provider, archiveEntry.model)
        changed = true
      }
      if (changed) void saveAppSettings()
    },
    [
      activeLlmConnection,
      examinationModelsByProvider,
      llmConnections,
      saveAppSettings,
      setActiveLlmConnectionId,
      setExaminationModelForProvider,
      setQuestionCount,
      sourceIdentity,
    ],
  )

  const generateForSelected = useCallback(
    async (options?: { regenerate?: boolean }) => {
      if (
        selectedSubject === null ||
        sourceIdentity === null ||
        selectedModelCode === null ||
        selectedModelSpec === null
      ) {
        return
      }
      if (blocker !== null) {
        addToast(blocker, { tone: "warning" })
        return
      }
      if (excerpts.length === 0) {
        addToast(
          "No code is attributed to this subject; nothing to generate.",
          {
            tone: "warning",
          },
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
      const currentIdentityKey = sourceIdentityKey(sourceIdentity)
      const loadingKey =
        lookupMetadata?.identityKey === currentIdentityKey &&
        targetQuestionCount === questionCount
          ? lookupMetadata.entryKey
          : `session-${createUuid()}`
      const generationControlId = `generation-${createUuid()}`
      const abort = new AbortController()
      const eventIdentity = effectiveIdentityForEvent() ?? sourceIdentity

      startGenerationSession({
        entryKey: loadingKey,
        generationControlId,
        abortController: abort,
        seedQuestions,
        sourceReferences: seedEntry?.sourceReferences ?? [],
        requestedQuestionCount: targetQuestionCount,
      })
      dispatchDisplay({
        type: "GENERATION_STARTED",
        identity: eventIdentity,
        entryKey: loadingKey,
      })

      try {
        const result = await workflowClient.run(
          "examination.generateQuestions",
          {
            personId: selectedSubject.id,
            contentScopeId:
              source.kind === "course"
                ? source.commitOid
                : source.contentScopeId,
            localIdentityContext: source.localIdentityContext,
            excerpts,
            excerptFileSources,
            questionCount: targetQuestionCount,
            llmSettings,
            generationControlId,
            ...(seedQuestions.length > 0 ? { seedQuestions } : {}),
            ...(options?.regenerate ? { regenerate: true } : {}),
          },
          {
            signal: abort.signal,
            onProgress: (progress: MilestoneProgress) => {
              applyGenerationProgress(loadingKey, progress.label)
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
                applyStreamProgress(loadingKey, output)
                return
              }
              applyPartialQuestions(loadingKey, {
                questions: output.questions,
                sourceReferences: output.sourceReferences,
                inProgressQuestion: output.inProgressQuestion,
              })
            },
          },
        )
        if (abort.signal.aborted) return
        const archiveKey = serializeExaminationArchiveStorageKey(result.key)
        const loadedEntry = toExaminationEntry(result)
        applyLoadedArchiveResult({
          loadingKey,
          resultKey: archiveKey,
          entry: loadedEntry,
        })
        const archiveEntry: AvailableArchiveEntry = {
          key: archiveKey,
          questionCount: result.archivedProvenance.questionCount,
          model: result.archivedProvenance.model,
          effort: result.archivedProvenance.effort,
          entry: loadedEntry,
        }
        setArchiveEntries((current) =>
          mergeAvailableArchiveEntries(current, [archiveEntry]),
        )
        setGeneratedQuestionCount((current) => {
          const next = new Map(current)
          next.set(
            selectedSubject.id,
            Math.max(
              next.get(selectedSubject.id) ?? 0,
              result.archivedProvenance.questionCount,
            ),
          )
          return next
        })
        dispatchDisplay({
          type: "GENERATION_SUCCEEDED",
          identity: eventIdentity,
          entryKey: archiveKey,
        })
      } catch (error) {
        if (abort.signal.aborted) return
        const message = getErrorMessage(error)
        applyGenerationError(loadingKey, message)
        dispatchDisplay({
          type: "GENERATION_FAILED",
          identity: eventIdentity,
          entryKey: loadingKey,
        })
        addToast(`Question generation failed: ${message}`, { tone: "error" })
      } finally {
        clearAbort(loadingKey, abort)
      }
    },
    [
      addToast,
      applyGenerationError,
      applyGenerationProgress,
      applyLoadedArchiveResult,
      applyPartialQuestions,
      applyStreamProgress,
      blocker,
      clearAbort,
      display.archiveEntry,
      display.displayEntry,
      effectiveIdentityForEvent,
      excerptFileSources,
      excerpts,
      llmSettings,
      lookupMetadata,
      questionCount,
      selectedModelCode,
      selectedModelSpec,
      selectedSubject,
      source,
      sourceIdentity,
      startGenerationSession,
      workflowClient,
    ],
  )

  const stopGeneration = useCallback(() => {
    const entry = display.entry
    if (
      displayState.display.kind !== "loading" ||
      entry?.status !== "loading"
    ) {
      return
    }
    const generationControlId = entry.generationControlId
    if (generationControlId === null) return
    requestGenerationStop(displayState.display.entryKey)
    workflowClient
      .run("examination.stopGeneration", { generationControlId })
      .catch((error: unknown) => {
        addToast(`Stop failed: ${getErrorMessage(error)}`, { tone: "error" })
      })
  }, [
    addToast,
    display.entry,
    displayState.display,
    requestGenerationStop,
    workflowClient,
  ])

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
    generatedQuestionCountBySubjectId,
    connections: llmConnections,
    activeConnection: activeLlmConnection,
    selectedModelCode,
    archiveEntries,
    showArchiveSelector,
    display,
    questionCount,
    showAnswers,
    blocker,
    rosterWarning:
      source.kind === "course" && selectedSubject !== null
        ? (source.rosterWarningBySubjectId.get(selectedSubject.id) ?? null)
        : null,
    commands: {
      selectSubject: setSelectedSubjectId,
      selectConnection,
      selectModelCode,
      openLlmSettings: () => openSettings("llm-connections"),
      importArchive: () => void importArchive(),
      exportArchive: () => void exportArchive(),
      changeQuestionCount,
      changeShowAnswers: setShowAnswers,
      selectArchiveEntry,
      generate: () => void generateForSelected(),
      stopGeneration,
      regenerate: () => void generateForSelected({ regenerate: true }),
      copyMarkdown: () => void copyMarkdown(),
    },
  }
}

function buildArchiveSelectionIdentity(params: {
  currentIdentity: SourceIdentity | null
  archiveEntry: AvailableArchiveEntry
}): SourceIdentity | null {
  if (params.currentIdentity === null) return null
  return {
    ...params.currentIdentity,
    questionCount: params.archiveEntry.questionCount,
    model: params.archiveEntry.model,
    effort: params.archiveEntry.effort,
  }
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
