import { EmptyState } from "@repo-edu/ui"
import { useLayoutEffect, useRef } from "react"
import type { ExaminationEntry } from "../../../stores/examination-store.js"
import { StreamingGenerationDetail } from "./GenerationProgress.js"
import { QuestionList } from "./QuestionList.js"
import type { AvailableArchiveEntry } from "./types.js"

type ExaminationQuestionDisplayProps = {
  entry: ExaminationEntry | null
  displayedArchiveEntry: AvailableArchiveEntry | null
  questionCount: number
  showAnswers: boolean
  layout: "page" | "pane"
  scrollResetKey: string | null
  emptyMessage?: string
}

export function ExaminationQuestionDisplay({
  entry,
  displayedArchiveEntry,
  questionCount,
  showAnswers,
  layout,
  scrollResetKey,
  emptyMessage,
}: ExaminationQuestionDisplayProps) {
  const isLoading = entry?.status === "loading"
  const hasPartialQuestions = isLoading && entry.questions.length > 0
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

  const sectionRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (scrollResetKey === null) return
    sectionRef.current?.scrollTo({ top: 0 })
  }, [scrollResetKey])

  return (
    <div
      ref={sectionRef}
      className={
        layout === "pane"
          ? "min-h-0 flex-1 overflow-auto [overflow-anchor:none]"
          : "min-h-0 [overflow-anchor:none]"
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
              Provider returned {displayEntry.partialQuestionCount.accepted} of{" "}
              {displayEntry.partialQuestionCount.requested} requested questions.
              This partial set was archived under its actual count.
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
        <EmptyState
          message={emptyMessage ?? "Click Generate to produce questions."}
        />
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
  )
}
