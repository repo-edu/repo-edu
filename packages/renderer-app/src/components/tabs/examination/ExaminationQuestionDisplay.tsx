import { EmptyState } from "@repo-edu/ui"
import { useLayoutEffect, useRef } from "react"
import type { ExaminationDisplaySelection } from "./display-selectors.js"
import { StreamingGenerationDetail } from "./GenerationProgress.js"
import { QuestionList } from "./QuestionList.js"

type ExaminationQuestionDisplayProps = {
  display: ExaminationDisplaySelection
  questionCount: number
  showAnswers: boolean
  layout: "page" | "pane"
  scrollResetKey: string | null
  emptyMessage?: string
}

export function ExaminationQuestionDisplay({
  display,
  questionCount,
  showAnswers,
  layout,
  scrollResetKey,
  emptyMessage,
}: ExaminationQuestionDisplayProps) {
  const entry = display.entry
  const loadingRequestedQuestionCount =
    entry?.status === "loading"
      ? (entry.partialQuestionCount?.requested ?? questionCount)
      : questionCount

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
      {display.displayEntry !== null && display.hasDisplayResults ? (
        <div className="flex flex-col gap-2">
          {!display.isLoading && display.archiveEntry !== null ? (
            <p className="text-xs text-muted-foreground">
              Archived {display.archiveEntry.questionCount} question
              {display.archiveEntry.questionCount === 1 ? "" : "s"}
            </p>
          ) : null}
          {display.displayEntry.status === "loaded" &&
          display.displayEntry.partialQuestionCount !== null ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Provider returned{" "}
              {display.displayEntry.partialQuestionCount.accepted} of{" "}
              {display.displayEntry.partialQuestionCount.requested} requested
              questions. This partial set was archived under its actual count.
            </p>
          ) : null}
          <QuestionList
            questions={display.displayEntry.questions}
            sourceReferences={display.displayEntry.sourceReferences}
            showAnswers={showAnswers}
          />
          {display.isLoading && entry !== null ? (
            <StreamingGenerationDetail
              entry={entry}
              index={display.displayEntry.questions.length}
              requestedQuestionCount={loadingRequestedQuestionCount}
              showAnswers={showAnswers}
            />
          ) : null}
        </div>
      ) : entry === null || entry.status === "idle" ? (
        <EmptyState
          message={emptyMessage ?? "Click Generate to produce questions."}
        />
      ) : display.isLoading && entry !== null ? (
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
