import type {
  DiagnosticOutput,
  ExaminationCodeExcerpt,
  ExaminationGenerateQuestionsResult,
  ExaminationLocalIdentityContext,
  ExaminationLookupQuestionsInput,
  ExaminationQuestion,
  ExaminationSourceReference,
  MilestoneProgress,
} from "@repo-edu/application-contract"
import {
  buildExaminationLocalIdentityContext,
  serializeExaminationArchiveStorageKey,
} from "@repo-edu/application-contract"
import type { BlameAuthorSummary } from "@repo-edu/domain/analysis"
import type {
  LlmProviderKind,
  PersistedLlmConnection,
} from "@repo-edu/domain/settings"
import {
  getExaminationDefaultSpec,
  getSpecByCode,
  listCatalogSpecsForProvider,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
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
  type ExaminationEntry,
  examinationStoreInternals,
  useExaminationStore,
} from "../../stores/examination-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import {
  buildExcerptFileSources,
  buildMemberExcerpts,
} from "./examination/build-excerpts.js"
import {
  buildPendingExaminationEntryKey,
  resolveExaminationBlockingReason,
  resolveExaminationEmptyState,
  shouldShowUnmatchedRosterWarning,
} from "./examination/view-state.js"

export type SubmissionExaminationContext = {
  pendingSourceKey: string
  personId: string
  studentName: string
  studentEmail: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

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
  const selectedEntryKey =
    requestedEntryKey !== null && requestedEntryPendingKey === pendingEntryKey
      ? requestedEntryKey
      : pendingEntryKey
  const entry = useExaminationStore((s) =>
    selectedEntryKey ? (s.entriesByKey.get(selectedEntryKey) ?? null) : null,
  )
  const selectedSummary =
    submissionContext !== null
      ? ({
          personId: submissionContext.personId,
          canonicalName: submissionContext.studentName,
          canonicalEmail: submissionContext.studentEmail,
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
          name: submissionContext.studentName,
          email: submissionContext.studentEmail,
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
      setAvailableArchiveEntries([])
      setSelectedArchiveEntryKey(null)
      setRequestedEntryKey(null)
      setRequestedEntryPendingKey(null)
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
      setAvailableArchiveEntries(archiveEntries)
      setSelectedArchiveEntryKey(
        result.exact === null ? (archiveEntries[0]?.key ?? null) : entryKey,
      )
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
        selectedEntryKey !== null && entry?.status === "loaded"
          ? [
              {
                key: selectedEntryKey,
                questionCount: entry.archivedQuestionCount ?? questionCount,
                entry,
              },
            ]
          : [],
      ),
    [availableArchiveEntries, entry, questionCount, selectedEntryKey],
  )

  useEffect(() => {
    if (archiveEntries.length === 0) {
      if (selectedArchiveEntryKey !== null) setSelectedArchiveEntryKey(null)
      return
    }
    if (
      selectedArchiveEntryKey !== null &&
      archiveEntries.some(
        (archiveEntry) => archiveEntry.key === selectedArchiveEntryKey,
      )
    ) {
      return
    }
    setSelectedArchiveEntryKey(archiveEntries[0].key)
  }, [archiveEntries, selectedArchiveEntryKey])

  const displayedArchiveEntry = useMemo(() => {
    if (archiveEntries.length === 0) return null
    return (
      archiveEntries.find(
        (archiveEntry) => archiveEntry.key === selectedArchiveEntryKey,
      ) ?? archiveEntries[0]
    )
  }, [archiveEntries, selectedArchiveEntryKey])

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
    const entryKey =
      pendingEntryKey ??
      buildPendingExaminationEntryKey({
        repositoryPath: pendingSourceKey,
        contentScopeId: commitOid,
        personId,
        questionCount,
        model: selectedModelCode,
        effort: selectedModelSpec.effort,
      })

    const existing = examinationStoreInternals.abortByEntryKey.get(entryKey)
    existing?.abort()
    const abort = new AbortController()
    examinationStoreInternals.abortByEntryKey.set(entryKey, abort)

    setEntry(entryKey, {
      status: "loading",
      questions: [],
      usage: null,
      errorMessage: null,
      generatedAt: null,
      fromArchive: false,
      sourceReferences: [],
      archivedQuestionCount: null,
      partialQuestionCount: null,
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
          questionCount,
          llmSettings,
          ...(options?.regenerate ? { regenerate: true } : {}),
        },
        {
          signal: abort.signal,
          onProgress: (_progress: MilestoneProgress) => undefined,
          onOutput: (output: DiagnosticOutput) => {
            if (output.channel === "warn") {
              addToast(output.message, {
                tone: "warning",
                durationMs: 6000,
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
      setRequestedEntryPendingKey(entryKey)
      setAvailableArchiveEntries((entries) =>
        mergeAvailableArchiveEntries(entries, [
          {
            key: archiveKey,
            questionCount: result.archivedProvenance.questionCount,
            entry: loadedEntry,
          },
        ]),
      )
      setSelectedArchiveEntryKey(archiveKey)
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
        partialQuestionCount: null,
      })
      addToast(`Question generation failed: ${message}`, { tone: "error" })
    } finally {
      if (examinationStoreInternals.abortByEntryKey.get(entryKey) === abort) {
        examinationStoreInternals.abortByEntryKey.delete(entryKey)
      }
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

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Examination</h2>
          <p className="text-sm text-muted-foreground">
            {isSubmission
              ? "Generate oral exam questions from the selected submission file."
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

      <LlmControls
        connections={llmConnections}
        activeConnection={activeLlmConnection}
        selectedModelCode={selectedModelCode}
        onSelectConnection={(id) => {
          setActiveLlmConnectionId(id)
          void saveAppSettings()
        }}
        onSelectModelCode={(code) => {
          if (activeProvider === null) return
          setExaminationModelForProvider(activeProvider, code)
          void saveAppSettings()
        }}
        onOpenSettings={() => openSettings("llm-connections")}
      />

      <div
        className={
          isSubmission
            ? "min-h-0 flex-1 overflow-hidden"
            : "grid grid-cols-[280px_1fr] gap-4 min-h-0 flex-1 overflow-hidden"
        }
      >
        {!isSubmission ? (
          <AuthorList
            authorSummaries={authorSummaries}
            authorDisplays={authorDisplays}
            selectedPersonId={selectedPersonId}
            onSelect={setSelectedPersonId}
          />
        ) : null}

        <div className="min-h-0 overflow-hidden">
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
              questionCount={questionCount}
              showAnswers={showAnswers}
              blocker={selectedBlocker}
              rosterWarning={selectedRosterWarning}
              onQuestionCountChange={setQuestionCount}
              onShowAnswersChange={setShowAnswers}
              onSelectArchiveEntry={setSelectedArchiveEntryKey}
              onGenerate={() => generate(selectedSummary.personId)}
              onRegenerate={() =>
                generate(selectedSummary.personId, { regenerate: true })
              }
              onCopyMarkdown={copyMarkdown}
            />
          )}
        </div>
      </div>
    </div>
  )
}

type AuthorListProps = {
  authorSummaries: BlameAuthorSummary[]
  authorDisplays: Map<string, { name: string; email: string }>
  selectedPersonId: string | null
  onSelect: (personId: string) => void
}

function AuthorList({
  authorSummaries,
  authorDisplays,
  selectedPersonId,
  onSelect,
}: AuthorListProps) {
  const sorted = useMemo(
    () => [...authorSummaries].sort((a, b) => b.lines - a.lines),
    [authorSummaries],
  )
  return (
    <div className="flex flex-col gap-1 overflow-auto rounded border p-2">
      {sorted.map((summary) => {
        const display = authorDisplays.get(summary.personId) ?? {
          name: summary.canonicalName,
          email: summary.canonicalEmail,
        }
        const active = summary.personId === selectedPersonId
        return (
          <button
            type="button"
            key={summary.personId}
            onClick={() => onSelect(summary.personId)}
            className={`flex flex-col items-start rounded px-3 py-2 text-left text-sm transition-colors ${
              active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <span className="font-medium">{display.name}</span>
            <span className="text-xs text-muted-foreground">
              {summary.lines} lines · {summary.linesPercent.toFixed(1)}%
            </span>
          </button>
        )
      })}
    </div>
  )
}

type AvailableArchiveEntry = {
  key: string
  questionCount: number
  entry: ExaminationEntry
}

type AuthorPanelProps = {
  authorName: string
  authorEmail: string
  summary: BlameAuthorSummary
  entry: ExaminationEntry | null
  archiveEntries: AvailableArchiveEntry[]
  displayedArchiveEntry: AvailableArchiveEntry | null
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  rosterWarning: string | null
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onSelectArchiveEntry: (key: string) => void
  onGenerate: () => void
  onRegenerate: () => void
  onCopyMarkdown: () => void
}

function AuthorPanel({
  authorName,
  authorEmail,
  summary,
  entry,
  archiveEntries,
  displayedArchiveEntry,
  questionCount,
  showAnswers,
  blocker,
  rosterWarning,
  onQuestionCountChange,
  onShowAnswersChange,
  onSelectArchiveEntry,
  onGenerate,
  onRegenerate,
  onCopyMarkdown,
}: AuthorPanelProps) {
  const isLoading = entry?.status === "loading"
  const exactHasResults = entry?.status === "loaded"
  const displayEntry = displayedArchiveEntry?.entry ?? null
  const hasDisplayResults = displayEntry?.status === "loaded"

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <Card>
        <CardHeader>
          <CardTitle>{authorName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {authorEmail} · {summary.lines} attributed lines
          </p>
          {rosterWarning !== null ? (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              {rosterWarning}
            </p>
          ) : null}
          <p className="mt-2 rounded border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
            Provider prompts use redacted excerpts, but local code may still
            contain personal data after best-effort redaction.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="examination-question-count">New questions</Label>
              <Input
                id="examination-question-count"
                type="number"
                min={1}
                max={20}
                value={questionCount}
                disabled={isLoading}
                onChange={(event) =>
                  onQuestionCountChange(Number(event.target.value))
                }
                className="w-24"
              />
            </div>
            <Button
              onClick={onGenerate}
              disabled={isLoading || blocker !== null}
              title={blocker ?? undefined}
            >
              {isLoading ? "Generating..." : "Generate questions"}
            </Button>
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isLoading || !exactHasResults || blocker !== null}
              title={
                blocker ??
                "Force a fresh LLM call, overwriting the archived entry."
              }
            >
              Regenerate
            </Button>
            <Button
              variant="secondary"
              onClick={() => onShowAnswersChange(!showAnswers)}
              disabled={!hasDisplayResults}
            >
              {showAnswers ? "Hide answers" : "Show answers"}
            </Button>
            <Button
              variant="ghost"
              onClick={onCopyMarkdown}
              disabled={!hasDisplayResults}
            >
              Copy as Markdown
            </Button>
          </div>
          {blocker !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">{blocker}</p>
          ) : null}
        </CardContent>
      </Card>

      {archiveEntries.length > 0 ? (
        <ArchiveSetSelector
          entries={archiveEntries}
          selectedKey={displayedArchiveEntry?.key ?? null}
          onSelect={onSelectArchiveEntry}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {displayEntry?.status === "loaded" ? (
          <div className="flex flex-col gap-2">
            {displayedArchiveEntry !== null ? (
              <p className="text-xs text-muted-foreground">
                Archived {displayedArchiveEntry.questionCount} question
                {displayedArchiveEntry.questionCount === 1 ? "" : "s"}
              </p>
            ) : null}
            {displayEntry.partialQuestionCount !== null ? (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                Provider returned {displayEntry.partialQuestionCount.accepted}{" "}
                of {displayEntry.partialQuestionCount.requested} requested
                questions. This partial set was archived under its actual count.
              </p>
            ) : null}
            <QuestionList
              questions={displayEntry.questions}
              sourceReferences={displayEntry.sourceReferences}
              showAnswers={showAnswers}
            />
          </div>
        ) : entry === null || entry.status === "idle" ? (
          <EmptyState message="Click Generate to produce questions for this author." />
        ) : isLoading ? (
          <EmptyState message="Generating... the model is writing questions from the attributed code." />
        ) : entry.status === "error" ? (
          <EmptyState
            message={`Generation failed: ${entry.errorMessage ?? "Unknown error."}`}
          />
        ) : null}
      </div>
    </div>
  )
}

type ArchiveSetSelectorProps = {
  entries: AvailableArchiveEntry[]
  selectedKey: string | null
  onSelect: (key: string) => void
}

function ArchiveSetSelector({
  entries,
  selectedKey,
  onSelect,
}: ArchiveSetSelectorProps) {
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Archived sets
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const active = entry.key === selectedKey
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelect(entry.key)}
              className={`rounded border px-2 py-1 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {entry.questionCount} question
              {entry.questionCount === 1 ? "" : "s"}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function toAvailableArchiveEntry(
  result: ExaminationGenerateQuestionsResult,
): AvailableArchiveEntry {
  const questionCount = result.archivedProvenance.questionCount
  return {
    key: serializeExaminationArchiveStorageKey(result.key),
    questionCount,
    entry: toExaminationEntry(result),
  }
}

function toExaminationEntry(
  result: ExaminationGenerateQuestionsResult,
): ExaminationEntry {
  return {
    status: "loaded",
    questions: result.questions,
    usage: result.usage,
    errorMessage: null,
    generatedAt: new Date(result.archivedProvenance.createdAtMs).toISOString(),
    fromArchive: result.fromArchive,
    sourceReferences: result.sourceReferences,
    archivedQuestionCount: result.archivedProvenance.questionCount,
    partialQuestionCount:
      result.requestedQuestionCount > result.archivedProvenance.questionCount
        ? {
            requested: result.requestedQuestionCount,
            accepted: result.archivedProvenance.questionCount,
          }
        : null,
  }
}

function mergeAvailableArchiveEntries(
  current: readonly AvailableArchiveEntry[],
  incoming: readonly AvailableArchiveEntry[],
): AvailableArchiveEntry[] {
  const byKey = new Map<string, AvailableArchiveEntry>()
  for (const entry of current) {
    byKey.set(entry.key, entry)
  }
  for (const entry of incoming) {
    byKey.set(entry.key, entry)
  }
  return [...byKey.values()].sort(compareAvailableArchiveEntries)
}

function compareAvailableArchiveEntries(
  a: AvailableArchiveEntry,
  b: AvailableArchiveEntry,
): number {
  const aTime =
    a.entry.generatedAt === null ? 0 : Date.parse(a.entry.generatedAt)
  const bTime =
    b.entry.generatedAt === null ? 0 : Date.parse(b.entry.generatedAt)
  if (aTime !== bTime) return bTime - aTime
  return a.questionCount - b.questionCount
}

type QuestionListProps = {
  questions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
  showAnswers: boolean
}

function QuestionList({
  questions,
  sourceReferences,
  showAnswers,
}: QuestionListProps) {
  return (
    <ol className="flex flex-col gap-3">
      {questions.map((question, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: questions are generated once per render batch and index is stable for that batch
          key={index}
          className="rounded border p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium">
                {index + 1}. {question.question}
              </div>
              {formatQuestionReference(question, sourceReferences) !== null ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatQuestionReference(question, sourceReferences)}
                </div>
              ) : null}
            </div>
          </div>
          {showAnswers ? (
            <div className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Answer
              </span>
              <div>{question.answer}</div>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

type LlmControlsProps = {
  connections: PersistedLlmConnection[]
  activeConnection: PersistedLlmConnection | null
  selectedModelCode: string | null
  onSelectConnection: (id: string) => void
  onSelectModelCode: (code: string) => void
  onOpenSettings: () => void
}

const PROVIDER_LABEL: Record<LlmProviderKind, string> = {
  claude: "Claude",
  codex: "Codex",
}

function LlmControls({
  connections,
  activeConnection,
  selectedModelCode,
  onSelectConnection,
  onSelectModelCode,
  onOpenSettings,
}: LlmControlsProps) {
  const provider = activeConnection?.provider ?? null
  const providerSpecs = useMemo(
    () => (provider === null ? [] : listCatalogSpecsForProvider(provider)),
    [provider],
  )

  if (connections.length === 0) {
    return (
      <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No LLM connection configured.{" "}
        <button type="button" className="underline" onClick={onOpenSettings}>
          Add one in Settings
        </button>{" "}
        to generate questions.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="examination-llm-connection">LLM connection</Label>
        <Select
          value={activeConnection?.id ?? ""}
          onValueChange={onSelectConnection}
        >
          <SelectTrigger id="examination-llm-connection" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.name} · {PROVIDER_LABEL[connection.provider]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="examination-llm-model">Model</Label>
        <Select
          value={selectedModelCode ?? ""}
          onValueChange={onSelectModelCode}
          disabled={provider === null || providerSpecs.length === 0}
        >
          <SelectTrigger id="examination-llm-model" className="w-56">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {providerSpecs.map((spec) => {
              const code = modelCode(spec)
              return (
                <SelectItem key={code} value={code}>
                  {formatSpecLabel(spec)}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function formatSpecLabel(spec: {
  provider: LlmProviderKind
  family: string
  effort: string
}): string {
  const provider = PROVIDER_LABEL[spec.provider]
  return spec.effort === "none"
    ? `${provider} ${spec.family}`
    : `${provider} ${spec.family} (${spec.effort})`
}

function resolveExaminationModelCode(
  provider: LlmProviderKind,
  byProvider: Partial<Record<LlmProviderKind, string>>,
): string | null {
  const persisted = byProvider[provider]
  if (typeof persisted === "string" && persisted.length > 0) {
    const spec = getSpecByCode(persisted)
    if (spec !== undefined && spec.provider === provider) {
      return persisted
    }
  }
  const fallback = getExaminationDefaultSpec(provider)
  return fallback === undefined ? null : modelCode(fallback)
}

function buildMarkdownTranscript(params: {
  authorName: string
  authorEmail: string
  questions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
}): string {
  const lines: string[] = [
    `# Oral examination - ${params.authorName}`,
    `_${params.authorEmail}_`,
    "",
  ]
  for (const [index, question] of params.questions.entries()) {
    lines.push(`## Q${index + 1}. ${question.question}`)
    const reference = formatQuestionReference(question, params.sourceReferences)
    if (reference !== null) {
      lines.push(`_Reference: ${reference}_`)
    }
    lines.push("")
    lines.push(`**Answer:** ${question.answer}`)
    lines.push("")
  }
  return lines.join("\n")
}

function formatQuestionReference(
  question: ExaminationQuestion,
  sourceReferences: readonly ExaminationSourceReference[],
): string | null {
  const { sourceId, lineRange } = question.anchor
  if (sourceId === null) return null
  const reference = sourceReferences.find((item) => item.sourceId === sourceId)
  const range = lineRange === null ? "" : `:${lineRange.start}-${lineRange.end}`
  if (reference === undefined || reference.occurrences.length !== 1) {
    return `${sourceId}${range}`
  }
  const occurrence = reference.occurrences[0]
  return occurrence === undefined
    ? `${sourceId}${range}`
    : `${occurrence.filePath}${range}`
}

function formatDateStamp(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}
