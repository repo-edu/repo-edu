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
import type { ExaminationEntry } from "../../../stores/examination-store.js"
import { ArchiveSetSelector } from "./ArchiveSetSelector.js"
import { StreamingGenerationDetail } from "./GenerationProgress.js"
import { QuestionList } from "./QuestionList.js"
import type { AvailableArchiveEntry } from "./types.js"

type AuthorPanelProps = {
  authorName: string
  authorEmail: string
  summary: BlameAuthorSummary
  entry: ExaminationEntry | null
  archiveEntries: AvailableArchiveEntry[]
  displayedArchiveEntry: AvailableArchiveEntry | null
  showArchiveSelector: boolean
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  rosterWarning: string | null
  layout: "page" | "pane"
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onSelectArchiveEntry: (entry: AvailableArchiveEntry) => void
  onGenerate: () => void
  onStopGeneration: () => void
  onRegenerate: () => void
  onCopyMarkdown: () => void
}

export function AuthorPanel({
  authorName,
  authorEmail,
  summary,
  entry,
  archiveEntries,
  displayedArchiveEntry,
  showArchiveSelector,
  questionCount,
  showAnswers,
  blocker,
  rosterWarning,
  layout,
  onQuestionCountChange,
  onShowAnswersChange,
  onSelectArchiveEntry,
  onGenerate,
  onStopGeneration,
  onRegenerate,
  onCopyMarkdown,
}: AuthorPanelProps) {
  const isLoading = entry?.status === "loading"
  const hasPartialQuestions = isLoading && entry.questions.length > 0
  const exactHasResults = entry?.status === "loaded"
  const loadingRequestedQuestionCount =
    entry?.status === "loading"
      ? (entry.partialQuestionCount?.requested ?? questionCount)
      : questionCount
  const displayEntry =
    hasPartialQuestions && entry !== null
      ? entry
      : (displayedArchiveEntry?.entry ?? null)
  const hasDisplayResults =
    displayEntry !== null && displayEntry.questions.length > 0

  return (
    <div
      className={
        layout === "pane"
          ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden"
          : "flex min-h-0 flex-col gap-3"
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{authorName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {authorEmail} · {summary.lines} lines
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
              onClick={isLoading ? onStopGeneration : onGenerate}
              disabled={isLoading ? false : blocker !== null}
              title={blocker ?? undefined}
            >
              {isLoading ? "Stop" : "Generate questions"}
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
              disabled={displayEntry?.status !== "loaded"}
            >
              Copy as Markdown
            </Button>
          </div>
          {blocker !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">{blocker}</p>
          ) : null}
        </CardContent>
      </Card>

      {showArchiveSelector ? (
        <ArchiveSetSelector
          entries={archiveEntries}
          selectedKey={displayedArchiveEntry?.key ?? null}
          onSelect={onSelectArchiveEntry}
        />
      ) : null}

      <div
        className={
          layout === "pane" ? "min-h-0 flex-1 overflow-auto" : "min-h-0"
        }
      >
        {displayEntry !== null && hasDisplayResults ? (
          <div className="flex flex-col gap-2">
            {!isLoading && displayedArchiveEntry !== null ? (
              <p className="text-xs text-muted-foreground">
                Archived {displayedArchiveEntry.questionCount} question
                {displayedArchiveEntry.questionCount === 1 ? "" : "s"}
              </p>
            ) : null}
            {displayEntry.status === "loaded" &&
            displayEntry.partialQuestionCount !== null ? (
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
            {isLoading && entry !== null ? (
              <StreamingGenerationDetail
                entry={entry}
                index={displayEntry.questions.length}
                requestedQuestionCount={loadingRequestedQuestionCount}
                showAnswers={showAnswers}
              />
            ) : null}
          </div>
        ) : entry === null || entry.status === "idle" ? (
          <EmptyState message="Click Generate to produce questions for this author." />
        ) : isLoading && entry !== null ? (
          <StreamingGenerationDetail
            entry={entry}
            index={0}
            requestedQuestionCount={loadingRequestedQuestionCount}
            showAnswers={showAnswers}
          />
        ) : entry.status === "error" ? (
          <EmptyState
            message={`Generation failed: ${entry.errorMessage ?? "Unknown error."}`}
          />
        ) : null}
      </div>
    </div>
  )
}
