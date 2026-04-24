import type {
  ExaminationProvenanceDrift,
  ExaminationQuestion,
  MilestoneProgress,
} from "@repo-edu/application-contract"
import type { BlameAuthorSummary } from "@repo-edu/domain/analysis"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
} from "@repo-edu/ui"
import { useMemo } from "react"
import { useRendererHost } from "../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectAuthorDisplayByPersonId,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import {
  type ExaminationEntry,
  examinationStoreInternals,
  useExaminationStore,
} from "../../stores/examination-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { buildMemberExcerpts } from "./examination/build-excerpts.js"

function buildExaminationEntryKey(parts: {
  repoPath: string
  commitOid: string
  memberId: string
  personId: string
}): string {
  return `${parts.repoPath}\0${parts.commitOid}\0${parts.memberId}\0${parts.personId}`
}

export function ExaminationTab() {
  const course = useCourseStore((s) => s.course)
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

  const workflowClient = useWorkflowClient()
  const rendererHost = useRendererHost()
  const addToast = useToastStore((s) => s.addToast)

  const authorSummaries = useMemo(
    () => blameResult?.authorSummaries ?? [],
    [blameResult],
  )

  const memberIdByPersonId = useMemo(() => {
    const map = new Map<string, string>()
    const matches = analysisResult?.rosterMatches?.matches ?? []
    for (const match of matches) {
      map.set(match.personId, match.memberId)
    }
    return map
  }, [analysisResult])

  const commitOid = useMemo(() => {
    const resolved = analysisResult?.resolvedAsOfOid
    if (resolved && resolved.length > 0) return resolved
    return asOfCommit ?? ""
  }, [analysisResult, asOfCommit])
  const selectedEntryKey = useMemo(() => {
    const memberId = selectedPersonId
      ? memberIdByPersonId.get(selectedPersonId)
      : undefined
    if (
      !selectedRepoPath ||
      commitOid.length === 0 ||
      !selectedPersonId ||
      !memberId
    ) {
      return null
    }
    return buildExaminationEntryKey({
      repoPath: selectedRepoPath,
      commitOid,
      memberId,
      personId: selectedPersonId,
    })
  }, [commitOid, memberIdByPersonId, selectedPersonId, selectedRepoPath])
  const entry = useExaminationStore((s) =>
    selectedEntryKey ? (s.entriesByKey.get(selectedEntryKey) ?? null) : null,
  )

  if (!blameResult || authorSummaries.length === 0) {
    return (
      <div className="h-full overflow-auto p-6">
        <EmptyState message="Run blame analysis in the Analysis tab to enable per-member examination questions." />
      </div>
    )
  }

  const resolveBlockingReason = (personId: string): string | null => {
    if (!course) {
      return "Open a course before generating questions."
    }
    if (!selectedRepoPath) {
      return "Select a repository in the Analysis tab first."
    }
    if (commitOid.length === 0) {
      return "Analysis must resolve a commit before archiving examination output."
    }
    if (!memberIdByPersonId.has(personId)) {
      return "This author is not matched to a roster member; archiving requires a roster match."
    }
    return null
  }

  const generate = async (
    personId: string,
    memberName: string,
    memberEmail: string,
    options?: { regenerate?: boolean },
  ) => {
    if (!blameResult) return
    const blocker = resolveBlockingReason(personId)
    if (blocker) {
      addToast(blocker, { tone: "warning" })
      return
    }
    const memberId = memberIdByPersonId.get(personId)
    if (!course || !selectedRepoPath || !memberId) return
    const entryKey = buildExaminationEntryKey({
      repoPath: selectedRepoPath,
      commitOid,
      memberId,
      personId,
    })

    const excerpts = buildMemberExcerpts(
      blameResult,
      blameResult.personDbOverlay,
      personId,
    )
    if (excerpts.length === 0) {
      addToast("No code is attributed to this member; nothing to generate.", {
        tone: "warning",
      })
      return
    }

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
      provenanceDrift: null,
      archivedQuestionCount: null,
    })

    try {
      const result = await workflowClient.run(
        "examination.generateQuestions",
        {
          groupSetId: course.id,
          memberId,
          commitOid,
          repoGitDir: selectedRepoPath,
          memberName,
          memberEmail,
          excerpts,
          questionCount,
          ...(options?.regenerate ? { regenerate: true } : {}),
        },
        {
          signal: abort.signal,
          onProgress: (_progress: MilestoneProgress) => undefined,
        },
      )
      if (abort.signal.aborted) return
      setEntry(entryKey, {
        status: "loaded",
        questions: result.questions,
        usage: result.usage,
        errorMessage: null,
        generatedAt: new Date().toISOString(),
        fromArchive: result.fromArchive,
        provenanceDrift: result.provenanceDrift,
        archivedQuestionCount: result.archivedProvenance.questionCount,
      })
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
        provenanceDrift: null,
        archivedQuestionCount: null,
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
    } catch (error) {
      addToast(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        { tone: "error" },
      )
    }
  }

  const selectedSummary =
    authorSummaries.find((s) => s.personId === selectedPersonId) ?? null
  const selectedDisplay =
    selectedSummary !== null
      ? (authorDisplays.get(selectedSummary.personId) ?? {
          name: selectedSummary.canonicalName,
          email: selectedSummary.canonicalEmail,
        })
      : null
  const selectedBlocker =
    selectedSummary !== null
      ? resolveBlockingReason(selectedSummary.personId)
      : null

  const copyMarkdown = async () => {
    if (!selectedSummary || !entry || entry.status !== "loaded") return
    const markdown = buildMarkdownTranscript({
      memberName: selectedDisplay?.name ?? selectedSummary.canonicalName,
      memberEmail: selectedDisplay?.email ?? selectedSummary.canonicalEmail,
      questions: entry.questions,
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
            Generate per-member oral exam questions from the code each student
            signed their name to in the final repository state.
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

      <div className="grid grid-cols-[280px_1fr] gap-4 min-h-0 flex-1 overflow-hidden">
        <MemberList
          authorSummaries={authorSummaries}
          authorDisplays={authorDisplays}
          selectedPersonId={selectedPersonId}
          onSelect={setSelectedPersonId}
        />

        <div className="min-h-0 overflow-hidden">
          {selectedSummary === null ? (
            <EmptyState message="Pick a student from the list to generate questions." />
          ) : (
            <MemberPanel
              memberName={
                selectedDisplay?.name ?? selectedSummary.canonicalName
              }
              memberEmail={
                selectedDisplay?.email ?? selectedSummary.canonicalEmail
              }
              summary={selectedSummary}
              entry={entry}
              questionCount={questionCount}
              showAnswers={showAnswers}
              blocker={selectedBlocker}
              onQuestionCountChange={setQuestionCount}
              onShowAnswersChange={setShowAnswers}
              onGenerate={() =>
                generate(
                  selectedSummary.personId,
                  selectedDisplay?.name ?? selectedSummary.canonicalName,
                  selectedDisplay?.email ?? selectedSummary.canonicalEmail,
                )
              }
              onRegenerate={() =>
                generate(
                  selectedSummary.personId,
                  selectedDisplay?.name ?? selectedSummary.canonicalName,
                  selectedDisplay?.email ?? selectedSummary.canonicalEmail,
                  { regenerate: true },
                )
              }
              onCopyMarkdown={copyMarkdown}
            />
          )}
        </div>
      </div>
    </div>
  )
}

type MemberListProps = {
  authorSummaries: BlameAuthorSummary[]
  authorDisplays: Map<string, { name: string; email: string }>
  selectedPersonId: string | null
  onSelect: (personId: string) => void
}

function MemberList({
  authorSummaries,
  authorDisplays,
  selectedPersonId,
  onSelect,
}: MemberListProps) {
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

type MemberPanelProps = {
  memberName: string
  memberEmail: string
  summary: BlameAuthorSummary
  entry: ExaminationEntry | null
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onGenerate: () => void
  onRegenerate: () => void
  onCopyMarkdown: () => void
}

function MemberPanel({
  memberName,
  memberEmail,
  summary,
  entry,
  questionCount,
  showAnswers,
  blocker,
  onQuestionCountChange,
  onShowAnswersChange,
  onGenerate,
  onRegenerate,
  onCopyMarkdown,
}: MemberPanelProps) {
  const isLoading = entry?.status === "loading"
  const hasResults = entry?.status === "loaded"
  const archiveHitDisplayed = hasResults && entry?.fromArchive === true
  const hasDrift = hasResults && entry?.provenanceDrift != null
  // On a clean archive hit, reflect the stored count so the visible input
  // matches what the user sees. When drift is present, leave the input
  // editable so Regenerate can be driven with a new count.
  const effectiveQuestionCount =
    archiveHitDisplayed && !hasDrift
      ? (entry?.archivedQuestionCount ?? questionCount)
      : questionCount
  const countDisabled = isLoading || (archiveHitDisplayed && !hasDrift)

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <Card>
        <CardHeader>
          <CardTitle>{memberName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {memberEmail} · {summary.lines} attributed lines
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="examination-question-count">Questions</Label>
              <Input
                id="examination-question-count"
                type="number"
                min={1}
                max={20}
                value={effectiveQuestionCount}
                disabled={countDisabled}
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
              disabled={isLoading || !hasResults || blocker !== null}
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
              disabled={!hasResults}
            >
              {showAnswers ? "Hide answers" : "Show answers"}
            </Button>
            <Button
              variant="ghost"
              onClick={onCopyMarkdown}
              disabled={!hasResults}
            >
              Copy as Markdown
            </Button>
          </div>
          {blocker !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">{blocker}</p>
          ) : null}
        </CardContent>
      </Card>

      {hasResults && entry?.provenanceDrift ? (
        <ProvenanceDriftBanner drift={entry.provenanceDrift} />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {entry === null || entry.status === "idle" ? (
          <EmptyState message="Click Generate to produce questions for this member." />
        ) : entry.status === "loading" ? (
          <EmptyState message="Generating... the model is writing questions from the attributed code." />
        ) : entry.status === "error" ? (
          <EmptyState
            message={`Generation failed: ${entry.errorMessage ?? "Unknown error."}`}
          />
        ) : (
          <QuestionList questions={entry.questions} showAnswers={showAnswers} />
        )}
      </div>
    </div>
  )
}

function ProvenanceDriftBanner({
  drift,
}: {
  drift: ExaminationProvenanceDrift
}) {
  const items: { label: string; from: string; to: string }[] = []
  if (drift.memberNameChanged) {
    items.push({
      label: "Name",
      from: drift.memberNameChanged.from,
      to: drift.memberNameChanged.to,
    })
  }
  if (drift.memberEmailChanged) {
    items.push({
      label: "Email",
      from: drift.memberEmailChanged.from,
      to: drift.memberEmailChanged.to,
    })
  }
  if (drift.repoGitDirChanged) {
    items.push({
      label: "Repository path",
      from: drift.repoGitDirChanged.from,
      to: drift.repoGitDirChanged.to,
    })
  }
  if (drift.assignmentContextChanged) {
    items.push({
      label: "Assignment context",
      from: drift.assignmentContextChanged.from || "(empty)",
      to: drift.assignmentContextChanged.to || "(empty)",
    })
  }
  if (drift.modelChanged) {
    items.push({
      label: "Model",
      from: drift.modelChanged.from,
      to: drift.modelChanged.to,
    })
  }
  if (drift.effortChanged) {
    items.push({
      label: "Effort",
      from: drift.effortChanged.from,
      to: drift.effortChanged.to,
    })
  }
  if (items.length === 0) return null
  return (
    <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <div className="font-medium">Archived questions, context drifted:</div>
      <ul className="mt-1 list-disc pl-5">
        {items.map((item) => (
          <li key={item.label}>
            {item.label}: {item.from} → {item.to}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        The questions below were generated against the previous context. Use
        Regenerate if you need a fresh set.
      </p>
    </div>
  )
}

type QuestionListProps = {
  questions: ExaminationQuestion[]
  showAnswers: boolean
}

function QuestionList({ questions, showAnswers }: QuestionListProps) {
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
              {question.filePath !== null ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {question.filePath}
                  {question.lineRange !== null
                    ? `:${question.lineRange.start}-${question.lineRange.end}`
                    : ""}
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

function buildMarkdownTranscript(params: {
  memberName: string
  memberEmail: string
  questions: ExaminationQuestion[]
}): string {
  const lines: string[] = [
    `# Oral examination — ${params.memberName}`,
    `_${params.memberEmail}_`,
    "",
  ]
  for (const [index, question] of params.questions.entries()) {
    lines.push(`## Q${index + 1}. ${question.question}`)
    if (question.filePath !== null) {
      const range =
        question.lineRange !== null
          ? `:${question.lineRange.start}-${question.lineRange.end}`
          : ""
      lines.push(`_Reference: ${question.filePath}${range}_`)
    }
    lines.push("")
    lines.push(`**Answer:** ${question.answer}`)
    lines.push("")
  }
  return lines.join("\n")
}

function formatDateStamp(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}
