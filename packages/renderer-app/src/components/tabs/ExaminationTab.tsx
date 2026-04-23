import type {
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
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectAuthorDisplayByPersonId,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import {
  type ExaminationEntry,
  examinationStoreInternals,
  useExaminationStore,
} from "../../stores/examination-store.js"
import { useToastStore } from "../../stores/toast-store.js"
import { buildMemberExcerpts } from "./examination/build-excerpts.js"

export function ExaminationTab() {
  const blameResult = useAnalysisStore((s) => s.blameResult)
  const authorDisplays = useAnalysisStore(selectAuthorDisplayByPersonId)

  const selectedPersonId = useExaminationStore((s) => s.selectedPersonId)
  const setSelectedPersonId = useExaminationStore((s) => s.setSelectedPersonId)
  const questionCount = useExaminationStore((s) => s.questionCount)
  const setQuestionCount = useExaminationStore((s) => s.setQuestionCount)
  const showAnswers = useExaminationStore((s) => s.showAnswers)
  const setShowAnswers = useExaminationStore((s) => s.setShowAnswers)
  const entry = useExaminationStore((s) =>
    selectedPersonId
      ? (s.entriesByPersonId.get(selectedPersonId) ?? null)
      : null,
  )
  const setEntry = useExaminationStore((s) => s.setEntry)

  const workflowClient = useWorkflowClient()
  const addToast = useToastStore((s) => s.addToast)

  const authorSummaries = useMemo(
    () => blameResult?.authorSummaries ?? [],
    [blameResult],
  )

  if (!blameResult || authorSummaries.length === 0) {
    return (
      <div className="h-full overflow-auto p-6">
        <EmptyState message="Run blame analysis in the Analysis tab to enable per-member examination questions." />
      </div>
    )
  }

  const generate = async (
    personId: string,
    memberName: string,
    memberEmail: string,
  ) => {
    if (!blameResult) return
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

    const existing = examinationStoreInternals.abortByPersonId.get(personId)
    existing?.abort()
    const abort = new AbortController()
    examinationStoreInternals.abortByPersonId.set(personId, abort)

    setEntry(personId, {
      status: "loading",
      questions: [],
      usage: null,
      errorMessage: null,
      generatedAt: null,
    })

    try {
      const result = await workflowClient.run(
        "examination.generateQuestions",
        {
          memberName,
          memberEmail,
          excerpts,
          questionCount,
        },
        {
          signal: abort.signal,
          onProgress: (_progress: MilestoneProgress) => undefined,
        },
      )
      if (abort.signal.aborted) return
      setEntry(personId, {
        status: "loaded",
        questions: result.questions,
        usage: result.usage,
        errorMessage: null,
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (abort.signal.aborted) return
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Unknown error generating questions."
      setEntry(personId, {
        status: "error",
        questions: [],
        usage: null,
        errorMessage: message,
        generatedAt: null,
      })
      addToast(`Question generation failed: ${message}`, { tone: "error" })
    } finally {
      if (examinationStoreInternals.abortByPersonId.get(personId) === abort) {
        examinationStoreInternals.abortByPersonId.delete(personId)
      }
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
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Examination</h2>
        <p className="text-sm text-muted-foreground">
          Generate per-member oral exam questions from the code each student
          signed their name to in the final repository state.
        </p>
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
              onQuestionCountChange={setQuestionCount}
              onShowAnswersChange={setShowAnswers}
              onGenerate={() =>
                generate(
                  selectedSummary.personId,
                  selectedDisplay?.name ?? selectedSummary.canonicalName,
                  selectedDisplay?.email ?? selectedSummary.canonicalEmail,
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
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onGenerate: () => void
  onCopyMarkdown: () => void
}

function MemberPanel({
  memberName,
  memberEmail,
  summary,
  entry,
  questionCount,
  showAnswers,
  onQuestionCountChange,
  onShowAnswersChange,
  onGenerate,
  onCopyMarkdown,
}: MemberPanelProps) {
  const isLoading = entry?.status === "loading"
  const hasResults = entry?.status === "loaded"

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
                value={questionCount}
                onChange={(event) =>
                  onQuestionCountChange(Number(event.target.value))
                }
                className="w-24"
              />
            </div>
            <Button onClick={onGenerate} disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate questions"}
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
        </CardContent>
      </Card>

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
