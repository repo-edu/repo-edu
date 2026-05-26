import type {
  ExaminationGenerateOutput,
  ExaminationLookupQuestionsInput,
  MilestoneProgress,
} from "@repo-edu/application-contract"
import {
  buildExaminationLocalIdentityContext,
  serializeExaminationArchiveStorageKey,
} from "@repo-edu/application-contract"
import type { BlameAuthorSummary } from "@repo-edu/domain/analysis"
import {
  getExaminationDefaultSpec,
  getSpecByCode,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import { Button, EmptyState } from "@repo-edu/ui"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRendererHost } from "../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import { useAnalysisContext } from "../../hooks/use-analysis-context.js"
import {
  selectAuthorDisplayByPersonId,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import {
  selectActiveLlmConnection,
  selectExaminationModelsByProvider,
  selectLlmConnections,
  useAppSettingsStore,
} from "../../stores/app-settings-store.js"
import {
  examinationStoreInternals,
  useExaminationStore,
} from "../../stores/examination-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { AuthorList } from "./examination/AuthorList.js"
import { AuthorPanel } from "./examination/AuthorPanel.js"
import {
  mergeAvailableArchiveEntries,
  mergeGeneratedQuestionSets,
  replaceGeneratedQuestionSets,
  toAvailableArchiveEntry,
  toExaminationEntry,
  toGeneratedQuestionSets,
} from "./examination/archive-entries.js"
import {
  buildExcerptFileSources,
  buildMemberExcerpts,
} from "./examination/build-excerpts.js"
import { LlmControls } from "./examination/LlmControls.js"
import { resolveExaminationModelCode } from "./examination/llm-models.js"
import { buildMarkdownTranscript } from "./examination/markdown-transcript.js"
import { SubmissionExaminationPane } from "./examination/SubmissionExaminationPane.js"
import type {
  AvailableArchiveEntry,
  GeneratedQuestionSets,
  GeneratedQuestionSetsByPersonId,
  SubmissionExaminationContext,
} from "./examination/types.js"
import {
  buildPendingExaminationEntryKey,
  resolveDisplayedArchiveEntryKey,
  resolveExaminationBlockingReason,
  resolveExaminationEmptyState,
  resolveVisibleExaminationEntryKey,
  shouldShowUnmatchedRosterWarning,
} from "./examination/view-state.js"

export type { SubmissionExaminationContext } from "./examination/types.js"

type ExaminationTabProps = {
  submissionContext?: SubmissionExaminationContext | null
}

export function ExaminationTab({
  submissionContext = null,
}: ExaminationTabProps = {}) {
  const isSubmission = submissionContext !== null
  const analysisContext = useAnalysisContext()
  const blameResult = useAnalysisStore((s) => s.blameResult)
  const analysisResult = useAnalysisStore((s) => s.result)
  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const asOfCommit = useAnalysisStore((s) => s.asOfCommit)
  const authorDisplays = useAnalysisStore(selectAuthorDisplayByPersonId)

  const selectedPersonId = useExaminationStore((s) => s.selectedPersonId)
  const setSelectedPersonId = useExaminationStore((s) => s.setSelectedPersonId)
  const questionCount = useExaminationStore((s) => s.questionCount)
  const setQuestionCount = useExaminationStore((s) => s.setQuestionCount)
  const showAnswers = useExaminationStore((s) => s.showAnswers)
  const setShowAnswers = useExaminationStore((s) => s.setShowAnswers)
  const setEntry = useExaminationStore((s) => s.setEntry)
  const setPartialQuestions = useExaminationStore((s) => s.setPartialQuestions)
  const setGenerationProgress = useExaminationStore(
    (s) => s.setGenerationProgress,
  )
  const setStreamProgress = useExaminationStore((s) => s.setStreamProgress)
  const clearEntry = useExaminationStore((s) => s.clearEntry)
  const [availableArchiveEntries, setAvailableArchiveEntries] = useState<
    AvailableArchiveEntry[]
  >([])
  const [selectedArchiveEntryKey, setSelectedArchiveEntryKey] = useState<
    string | null
  >(null)
  const [requestedEntryKey, setRequestedEntryKey] = useState<string | null>(
    null,
  )
  const [requestedEntryPendingKey, setRequestedEntryPendingKey] = useState<
    string | null
  >(null)
  const [activeGenerationEntryKey, setActiveGenerationEntryKey] = useState<
    string | null
  >(null)
  const [generatedQuestionSetsByPersonId, setGeneratedQuestionSetsByPersonId] =
    useState<GeneratedQuestionSetsByPersonId>(new Map())

  const workflowClient = useWorkflowClient()
  const rendererHost = useRendererHost()
  const addToast = useToastStore((s) => s.addToast)

  const llmConnections = useAppSettingsStore(selectLlmConnections)
  const activeLlmConnection = useAppSettingsStore(selectActiveLlmConnection)
  const examinationModelsByProvider = useAppSettingsStore(
    selectExaminationModelsByProvider,
  )
  const setActiveLlmConnectionId = useAppSettingsStore(
    (s) => s.setActiveLlmConnectionId,
  )
  const setExaminationModelForProvider = useAppSettingsStore(
    (s) => s.setExaminationModelForProvider,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const openSettings = useUiStore((s) => s.openSettings)

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

  // Auto-correct provider/model mismatch caused by direct settings edits
  // before any examination call reaches the workflow.
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

  const authorSummaries = useMemo(
    () => blameResult?.authorSummaries ?? [],
    [blameResult],
  )

  const rosterMemberIdByPersonId = useMemo(() => {
    const map = new Map<string, string>()
    const matches = analysisResult?.rosterMatches?.matches ?? []
    for (const match of matches) {
      map.set(match.personId, match.memberId)
    }
    return map
  }, [analysisResult])

  const rosterPopulated = useMemo(() => {
    const roster = analysisContext.course?.roster
    if (!roster) return false
    return roster.students.length + roster.staff.length > 0
  }, [analysisContext.course])

  const commitOid = useMemo(() => {
    if (submissionContext !== null) {
      return submissionContext.contentScopeId
    }
    const resolved = analysisResult?.resolvedAsOfOid
    if (resolved && resolved.length > 0) return resolved
    return asOfCommit ?? ""
  }, [analysisResult, asOfCommit, submissionContext])
  const effectivePersonId = submissionContext?.personId ?? selectedPersonId
  const selectedExcerpts = useMemo(() => {
    if (submissionContext !== null) return submissionContext.excerpts
    if (!blameResult || !selectedPersonId) return []
    return buildMemberExcerpts(
      blameResult,
      blameResult.personDbOverlay,
      selectedPersonId,
    )
  }, [blameResult, selectedPersonId, submissionContext])
  const selectedExcerptFileSources = useMemo(() => {
    if (submissionContext !== null) return submissionContext.excerptFileSources
    if (!blameResult) return {}
    return buildExcerptFileSources(blameResult, selectedExcerpts)
  }, [blameResult, selectedExcerpts, submissionContext])
  const localIdentityContext = useMemo(() => {
    if (submissionContext !== null) {
      return submissionContext.localIdentityContext
    }
    if (!blameResult) return null
    return buildExaminationLocalIdentityContext({
      personDb: blameResult.personDbOverlay,
      roster: analysisContext.course?.roster ?? null,
    })
  }, [analysisContext.course, blameResult, submissionContext])
  const pendingSourceKey =
    submissionContext?.pendingSourceKey ?? selectedRepoPath
  const pendingEntryKey = useMemo(() => {
    if (
      !pendingSourceKey ||
      commitOid.length === 0 ||
      !effectivePersonId ||
      selectedModelCode === null ||
      selectedModelSpec === null ||
      selectedExcerpts.length === 0
    ) {
      return null
    }
    return buildPendingExaminationEntryKey({
      repositoryPath: pendingSourceKey,
      contentScopeId: commitOid,
      personId: effectivePersonId,
      questionCount,
      model: selectedModelCode,
      effort: selectedModelSpec.effort,
    })
  }, [
    commitOid,
    effectivePersonId,
    pendingSourceKey,
    questionCount,
    selectedExcerpts,
    selectedModelCode,
    selectedModelSpec,
  ])
  const pendingEntry = useExaminationStore((s) =>
    pendingEntryKey ? (s.entriesByKey.get(pendingEntryKey) ?? null) : null,
  )
  const activeGenerationEntry = useExaminationStore((s) =>
    activeGenerationEntryKey
      ? (s.entriesByKey.get(activeGenerationEntryKey) ?? null)
      : null,
  )
  const visibleActiveGenerationEntryKey =
    activeGenerationEntryKey !== null &&
    (activeGenerationEntry?.status === "loading" ||
      activeGenerationEntry?.status === "error")
      ? activeGenerationEntryKey
      : null
  const selectedEntryKey =
    visibleActiveGenerationEntryKey ??
    resolveVisibleExaminationEntryKey({
      pendingEntryKey,
      requestedEntryKey,
      requestedEntryPendingKey,
      pendingEntryIsLoading: pendingEntry?.status === "loading",
    })
  const activeGenerationResetKey = pendingEntryKey
  useEffect(() => {
    if (activeGenerationResetKey === null) {
      setActiveGenerationEntryKey(null)
      return
    }
    setActiveGenerationEntryKey(null)
  }, [activeGenerationResetKey])
  const entry = useExaminationStore((s) =>
    selectedEntryKey ? (s.entriesByKey.get(selectedEntryKey) ?? null) : null,
  )
  const selectedSummary =
    submissionContext !== null
      ? ({
          personId: submissionContext.personId,
          canonicalName: submissionContext.displayTitle,
          canonicalEmail: submissionContext.displaySubtitle,
          lines: submissionContext.excerpts.reduce(
            (count, excerpt) => count + excerpt.lines.length,
            0,
          ),
          linesPercent: 100,
        } satisfies BlameAuthorSummary)
      : (authorSummaries.find((s) => s.personId === selectedPersonId) ?? null)
  const selectedDisplay =
    submissionContext !== null
      ? {
          name: submissionContext.displayTitle,
          email: submissionContext.displaySubtitle,
        }
      : selectedSummary !== null
        ? (authorDisplays.get(selectedSummary.personId) ?? {
            name: selectedSummary.canonicalName,
            email: selectedSummary.canonicalEmail,
          })
        : null
  const selectedLookupInput =
    useMemo<ExaminationLookupQuestionsInput | null>(() => {
      if (
        commitOid.length === 0 ||
        effectivePersonId === null ||
        localIdentityContext === null ||
        selectedModelCode === null ||
        selectedModelSpec === null ||
        selectedExcerpts.length === 0
      ) {
        return null
      }
      return {
        personId: effectivePersonId,
        contentScopeId: commitOid,
        localIdentityContext,
        excerpts: selectedExcerpts,
        excerptFileSources: selectedExcerptFileSources,
        questionCount,
        llmSettings,
      }
    }, [
      commitOid,
      llmSettings,
      localIdentityContext,
      questionCount,
      selectedExcerpts,
      selectedExcerptFileSources,
      selectedModelCode,
      selectedModelSpec,
      effectivePersonId,
    ])
  const emptyStateMessage = resolveExaminationEmptyState({
    selectedRepositoryPath: selectedRepoPath,
    hasBlameResult: blameResult !== null,
    authorCount: authorSummaries.length,
    selectedPersonId,
  })

  const refreshArchiveEntries = useCallback(
    async (
      lookupInput: ExaminationLookupQuestionsInput,
      pendingKey: string,
      signal?: AbortSignal,
    ): Promise<void> => {
      const result = await workflowClient.run(
        "examination.lookupQuestions",
        lookupInput,
        {
          signal,
          onProgress: (_progress: MilestoneProgress) => undefined,
        },
      )
      if (signal?.aborted) return
      const entryKey = serializeExaminationArchiveStorageKey(
        result.requestedKey,
      )
      setRequestedEntryKey(entryKey)
      setRequestedEntryPendingKey(pendingKey)
      const archiveEntries = result.availableSets.map((questionSet) =>
        toAvailableArchiveEntry(questionSet),
      )
      setGeneratedQuestionSetsByPersonId((current) =>
        mergeGeneratedQuestionSets(
          current,
          lookupInput.personId,
          result.availableSets,
        ),
      )
      setAvailableArchiveEntries(archiveEntries)
      const currentEntry =
        useExaminationStore.getState().entriesByKey.get(entryKey) ?? null
      if (result.exact === null) {
        if (currentEntry !== null && currentEntry.status !== "loading") {
          clearEntry(entryKey)
        }
        return
      }
      if (currentEntry !== null && currentEntry.status === "loading") return
      setEntry(entryKey, toExaminationEntry(result.exact))
    },
    [clearEntry, setEntry, workflowClient],
  )

  const refreshGeneratedQuestionSummaries = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (
        isSubmission ||
        !blameResult ||
        commitOid.length === 0 ||
        localIdentityContext === null ||
        selectedModelCode === null ||
        selectedModelSpec === null
      ) {
        setGeneratedQuestionSetsByPersonId(new Map())
        return
      }

      const summaries = new Map<string, GeneratedQuestionSets>()
      for (const summary of authorSummaries) {
        if (signal?.aborted) return
        const excerpts = buildMemberExcerpts(
          blameResult,
          blameResult.personDbOverlay,
          summary.personId,
        )
        if (excerpts.length === 0) {
          summaries.set(summary.personId, new Map())
          continue
        }

        try {
          const result = await workflowClient.run(
            "examination.lookupQuestions",
            {
              personId: summary.personId,
              contentScopeId: commitOid,
              localIdentityContext,
              excerpts,
              excerptFileSources: buildExcerptFileSources(
                blameResult,
                excerpts,
              ),
              questionCount,
              llmSettings,
            },
            {
              signal,
              onProgress: (_progress: MilestoneProgress) => undefined,
            },
          )
          if (signal?.aborted) return
          summaries.set(
            summary.personId,
            toGeneratedQuestionSets(result.availableSets),
          )
        } catch (_error) {
          if (signal?.aborted) return
          summaries.set(summary.personId, new Map())
        }
      }

      setGeneratedQuestionSetsByPersonId(summaries)
    },
    [
      authorSummaries,
      blameResult,
      commitOid,
      isSubmission,
      llmSettings,
      localIdentityContext,
      questionCount,
      selectedModelCode,
      selectedModelSpec,
      workflowClient,
    ],
  )

  useEffect(() => {
    const abort = new AbortController()
    void refreshGeneratedQuestionSummaries(abort.signal)

    return () => abort.abort()
  }, [refreshGeneratedQuestionSummaries])

  useEffect(() => {
    if (pendingEntryKey === null || selectedLookupInput === null) {
      setAvailableArchiveEntries([])
      setSelectedArchiveEntryKey(null)
      setRequestedEntryKey(null)
      setRequestedEntryPendingKey(null)
      return
    }

    const abort = new AbortController()
    void refreshArchiveEntries(
      selectedLookupInput,
      pendingEntryKey,
      abort.signal,
    ).catch((_error: unknown) => undefined)

    return () => abort.abort()
  }, [refreshArchiveEntries, pendingEntryKey, selectedLookupInput])

  const archiveEntries = useMemo(
    () =>
      mergeAvailableArchiveEntries(
        availableArchiveEntries,
        selectedEntryKey !== null &&
          entry?.status === "loaded" &&
          entry.archivedModel !== null &&
          entry.archivedEffort !== null
          ? [
              {
                key: selectedEntryKey,
                questionCount: entry.archivedQuestionCount ?? questionCount,
                model: entry.archivedModel,
                effort: entry.archivedEffort,
                entry,
              },
            ]
          : [],
      ),
    [availableArchiveEntries, entry, questionCount, selectedEntryKey],
  )

  const activeRequestedEntryKey =
    requestedEntryPendingKey === pendingEntryKey ? requestedEntryKey : null
  const displayedArchiveEntryKey = useMemo(
    () =>
      resolveDisplayedArchiveEntryKey({
        archiveEntryKeys: archiveEntries.map(
          (archiveEntry) => archiveEntry.key,
        ),
        selectedArchiveEntryKey,
        requestedEntryKey: activeRequestedEntryKey,
      }),
    [activeRequestedEntryKey, archiveEntries, selectedArchiveEntryKey],
  )

  const displayedArchiveEntry = useMemo(() => {
    if (displayedArchiveEntryKey === null) return null
    return (
      archiveEntries.find(
        (archiveEntry) => archiveEntry.key === displayedArchiveEntryKey,
      ) ?? null
    )
  }, [archiveEntries, displayedArchiveEntryKey])

  const handleSelectArchiveEntry = useCallback(
    (archiveEntry: AvailableArchiveEntry) => {
      setSelectedArchiveEntryKey(archiveEntry.key)
      setQuestionCount(archiveEntry.questionCount)
      const spec = getSpecByCode(archiveEntry.model)
      if (spec === undefined) return
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
    ],
  )

  if (
    !isSubmission &&
    (!selectedRepoPath || !blameResult || authorSummaries.length === 0)
  ) {
    return (
      <div className="h-full overflow-auto p-6">
        <EmptyState message={emptyStateMessage ?? ""} />
      </div>
    )
  }

  const resolveBlockingReason = (): string | null => {
    return resolveExaminationBlockingReason({
      selectedRepositoryPath: pendingSourceKey,
      commitOid,
      hasActiveLlmConnection: activeLlmConnection !== null,
    })
  }

  const resolveRosterWarning = (personId: string): string | null => {
    const rosterMemberId = rosterMemberIdByPersonId.get(personId) ?? null
    if (
      !shouldShowUnmatchedRosterWarning({
        analysisKind: analysisContext.kind,
        rosterPopulated,
        rosterMemberId,
      })
    ) {
      return null
    }
    return "This author is not in the course roster; verify they belong to this course before sharing the questions."
  }

  const generate = async (
    personId: string,
    options?: { regenerate?: boolean },
  ) => {
    if (!isSubmission && !blameResult) return
    const blocker = resolveBlockingReason()
    if (blocker) {
      addToast(blocker, { tone: "warning" })
      return
    }
    if (!pendingSourceKey) return

    const excerpts =
      submissionContext?.excerpts ??
      (blameResult === null
        ? []
        : buildMemberExcerpts(
            blameResult,
            blameResult.personDbOverlay,
            personId,
          ))
    if (excerpts.length === 0) {
      addToast("No code is attributed to this author; nothing to generate.", {
        tone: "warning",
      })
      return
    }
    if (selectedModelCode === null || selectedModelSpec === null) {
      addToast("Choose an examination model before generating questions.", {
        tone: "warning",
      })
      return
    }
    if (localIdentityContext === null) return
    const excerptFileSources =
      submissionContext?.excerptFileSources ??
      (blameResult === null
        ? {}
        : buildExcerptFileSources(blameResult, excerpts))
    const seedEntry =
      options?.regenerate || displayedArchiveEntry?.entry.status !== "loaded"
        ? null
        : displayedArchiveEntry.entry
    const seedQuestions = seedEntry?.questions ?? []
    const requestedQuestionCount =
      options?.regenerate && displayedArchiveEntry !== null
        ? displayedArchiveEntry.questionCount
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
    const entryKey =
      targetQuestionCount === questionCount && pendingEntryKey !== null
        ? pendingEntryKey
        : buildPendingExaminationEntryKey({
            repositoryPath: pendingSourceKey,
            contentScopeId: commitOid,
            personId,
            questionCount: targetQuestionCount,
            model: selectedModelCode,
            effort: selectedModelSpec.effort,
          })

    const existing = examinationStoreInternals.abortByEntryKey.get(entryKey)
    existing?.abort()
    const abort = new AbortController()
    examinationStoreInternals.abortByEntryKey.set(entryKey, abort)
    setActiveGenerationEntryKey(entryKey)

    setEntry(entryKey, {
      status: "loading",
      questions: seedQuestions,
      usage: null,
      errorMessage: null,
      generatedAt: null,
      fromArchive: false,
      sourceReferences: seedEntry?.sourceReferences ?? [],
      archivedQuestionCount: null,
      archivedModel: null,
      archivedEffort: null,
      partialQuestionCount: {
        requested: targetQuestionCount,
        accepted: seedQuestions.length,
      },
      generationProgressLabel: "Preparing question generation.",
      streamedResponseCharacterCount: 0,
      streamedResponsePreview: "",
      inProgressQuestion: null,
    })

    try {
      const result = await workflowClient.run(
        "examination.generateQuestions",
        {
          personId,
          contentScopeId: commitOid,
          localIdentityContext,
          excerpts,
          excerptFileSources,
          questionCount: targetQuestionCount,
          llmSettings,
          generationControlId: entryKey,
          ...(seedQuestions.length > 0 ? { seedQuestions } : {}),
          ...(options?.regenerate ? { regenerate: true } : {}),
        },
        {
          signal: abort.signal,
          onProgress: (progress: MilestoneProgress) => {
            setGenerationProgress(entryKey, progress.label)
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
              setStreamProgress(entryKey, output)
              return
            }
            if (output.kind === "partial-questions") {
              setPartialQuestions(entryKey, {
                questions: output.questions,
                sourceReferences: output.sourceReferences,
                inProgressQuestion: output.inProgressQuestion,
              })
            }
          },
        },
      )
      if (abort.signal.aborted) return
      const archiveKey = serializeExaminationArchiveStorageKey(result.key)
      const loadedEntry = toExaminationEntry(result)
      if (archiveKey !== entryKey) {
        clearEntry(entryKey)
      }
      setEntry(archiveKey, loadedEntry)
      setRequestedEntryKey(archiveKey)
      setRequestedEntryPendingKey(pendingEntryKey ?? entryKey)
      const archiveEntry: AvailableArchiveEntry = {
        key: archiveKey,
        questionCount: result.archivedProvenance.questionCount,
        model: result.archivedProvenance.model,
        effort: result.archivedProvenance.effort,
        entry: loadedEntry,
      }
      setAvailableArchiveEntries((current) => {
        const preserved = current.filter(
          (existing) =>
            existing.model !== archiveEntry.model ||
            existing.effort !== archiveEntry.effort,
        )
        return mergeAvailableArchiveEntries(preserved, [archiveEntry])
      })
      setGeneratedQuestionSetsByPersonId((current) =>
        replaceGeneratedQuestionSets(current, personId, [result]),
      )
      setSelectedArchiveEntryKey(archiveKey)
      setActiveGenerationEntryKey(null)
    } catch (error) {
      if (abort.signal.aborted) return
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Unknown error generating questions."
      setEntry(entryKey, {
        status: "error",
        questions: [],
        usage: null,
        errorMessage: message,
        generatedAt: null,
        fromArchive: false,
        sourceReferences: [],
        archivedQuestionCount: null,
        archivedModel: null,
        archivedEffort: null,
        partialQuestionCount: null,
        generationProgressLabel: null,
        streamedResponseCharacterCount: 0,
        streamedResponsePreview: "",
        inProgressQuestion: null,
      })
      addToast(`Question generation failed: ${message}`, { tone: "error" })
    } finally {
      if (examinationStoreInternals.abortByEntryKey.get(entryKey) === abort) {
        examinationStoreInternals.abortByEntryKey.delete(entryKey)
      }
    }
  }

  const stopGeneration = async (generationControlId: string) => {
    try {
      await workflowClient.run("examination.stopGeneration", {
        generationControlId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Stop failed: ${message}`, { tone: "error" })
    }
  }

  const exportArchive = async () => {
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
  }

  const importArchive = async () => {
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
      void refreshGeneratedQuestionSummaries().catch(
        (_error: unknown) => undefined,
      )
      if (selectedEntryKey !== null && selectedLookupInput !== null) {
        void refreshArchiveEntries(
          selectedLookupInput,
          pendingEntryKey ?? selectedEntryKey,
        ).catch((_error: unknown) => undefined)
      }
    } catch (error) {
      addToast(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        { tone: "error" },
      )
    }
  }

  const selectedBlocker =
    selectedSummary !== null ? resolveBlockingReason() : null
  const selectedRosterWarning =
    selectedSummary !== null
      ? resolveRosterWarning(selectedSummary.personId)
      : null
  const showArchiveSelector =
    archiveEntries.length > 1 ||
    (archiveEntries.length === 1 &&
      archiveEntries[0]?.key !== activeRequestedEntryKey)

  const copyMarkdown = async () => {
    if (!selectedSummary || displayedArchiveEntry === null) return
    const markdown = buildMarkdownTranscript({
      authorName: selectedDisplay?.name ?? selectedSummary.canonicalName,
      authorEmail: selectedDisplay?.email ?? selectedSummary.canonicalEmail,
      questions: displayedArchiveEntry.entry.questions,
      sourceReferences: displayedArchiveEntry.entry.sourceReferences,
    })
    try {
      await navigator.clipboard.writeText(markdown)
      addToast("Copied question set to clipboard.", { tone: "success" })
    } catch (_error) {
      addToast("Clipboard copy failed.", { tone: "error" })
    }
  }

  const handleSelectLlmConnection = (id: string) => {
    setSelectedArchiveEntryKey(null)
    setActiveLlmConnectionId(id)
    void saveAppSettings()
  }
  const handleSelectModelCode = (code: string) => {
    if (activeProvider === null) return
    setSelectedArchiveEntryKey(null)
    setExaminationModelForProvider(activeProvider, code)
    void saveAppSettings()
  }
  const handleOpenLlmSettings = () => openSettings("llm-connections")
  const handleQuestionCountChange = (count: number) => {
    setSelectedArchiveEntryKey(null)
    setQuestionCount(count)
  }
  const handleStopGeneration = () => {
    const generationControlId =
      entry?.status === "loading" ? selectedEntryKey : null
    if (generationControlId !== null) void stopGeneration(generationControlId)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Examination</h2>
          <p className="text-sm text-muted-foreground">
            {isSubmission
              ? "Generate oral exam questions from the selected submission files."
              : "Generate oral exam questions from the code each author signed their name to in the final repository state."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={importArchive}>
            Import archive...
          </Button>
          <Button variant="outline" size="sm" onClick={exportArchive}>
            Export archive...
          </Button>
        </div>
      </div>

      {isSubmission && selectedSummary !== null ? (
        <SubmissionExaminationPane
          connections={llmConnections}
          activeConnection={activeLlmConnection}
          selectedModelCode={selectedModelCode}
          onSelectConnection={handleSelectLlmConnection}
          onSelectModelCode={handleSelectModelCode}
          onOpenSettings={handleOpenLlmSettings}
          entry={entry}
          archiveEntries={archiveEntries}
          displayedArchiveEntry={displayedArchiveEntry}
          showArchiveSelector={showArchiveSelector}
          questionCount={questionCount}
          showAnswers={showAnswers}
          blocker={selectedBlocker}
          onQuestionCountChange={handleQuestionCountChange}
          onShowAnswersChange={setShowAnswers}
          onSelectArchiveEntry={handleSelectArchiveEntry}
          onGenerate={() => generate(selectedSummary.personId)}
          onStopGeneration={handleStopGeneration}
          onRegenerate={() =>
            generate(selectedSummary.personId, { regenerate: true })
          }
          onCopyMarkdown={copyMarkdown}
        />
      ) : (
        <>
          <LlmControls
            connections={llmConnections}
            activeConnection={activeLlmConnection}
            selectedModelCode={selectedModelCode}
            onSelectConnection={handleSelectLlmConnection}
            onSelectModelCode={handleSelectModelCode}
            onOpenSettings={handleOpenLlmSettings}
          />
          <div className="grid grid-cols-[280px_1fr] gap-4 min-h-0 flex-1 overflow-hidden">
            <AuthorList
              authorSummaries={authorSummaries}
              authorDisplays={authorDisplays}
              generatedQuestionSetsByPersonId={generatedQuestionSetsByPersonId}
              selectedPersonId={selectedPersonId}
              onSelect={setSelectedPersonId}
            />
            <div className="h-full min-h-0 overflow-hidden">
              {selectedSummary === null ? (
                <EmptyState message={emptyStateMessage ?? ""} />
              ) : (
                <AuthorPanel
                  authorName={
                    selectedDisplay?.name ?? selectedSummary.canonicalName
                  }
                  authorEmail={
                    selectedDisplay?.email ?? selectedSummary.canonicalEmail
                  }
                  summary={selectedSummary}
                  entry={entry}
                  archiveEntries={archiveEntries}
                  displayedArchiveEntry={displayedArchiveEntry}
                  showArchiveSelector={showArchiveSelector}
                  questionCount={questionCount}
                  showAnswers={showAnswers}
                  blocker={selectedBlocker}
                  rosterWarning={selectedRosterWarning}
                  layout="pane"
                  onQuestionCountChange={handleQuestionCountChange}
                  onShowAnswersChange={setShowAnswers}
                  onSelectArchiveEntry={handleSelectArchiveEntry}
                  onGenerate={() => generate(selectedSummary.personId)}
                  onStopGeneration={handleStopGeneration}
                  onRegenerate={() =>
                    generate(selectedSummary.personId, { regenerate: true })
                  }
                  onCopyMarkdown={copyMarkdown}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatDateStamp(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}
