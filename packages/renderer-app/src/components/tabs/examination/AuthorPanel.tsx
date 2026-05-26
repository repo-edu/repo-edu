import type { BlameAuthorSummary } from "@repo-edu/domain/analysis"
import { Card, CardHeader, CardTitle } from "@repo-edu/ui"
import { useCallback, useLayoutEffect, useRef } from "react"
import type { ExaminationEntry } from "../../../stores/examination-store.js"
import { ArchiveSetSelector } from "./ArchiveSetSelector.js"
import { ExaminationControlsCard } from "./ExaminationControlsCard.js"
import { ExaminationQuestionDisplay } from "./ExaminationQuestionDisplay.js"
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
  const displayEntry =
    hasPartialQuestions && entry !== null
      ? entry
      : (displayedArchiveEntry?.entry ?? null)
  const hasDisplayResults =
    displayEntry !== null && displayEntry.questions.length > 0
  const archiveSelectorRef = useRef<HTMLDivElement>(null)
  const pendingQuestionRevealKeyRef = useRef<string | null>(null)
  const displayedArchiveEntryKey = displayedArchiveEntry?.key ?? null
  const selectArchiveEntry = useCallback(
    (archiveEntry: AvailableArchiveEntry) => {
      pendingQuestionRevealKeyRef.current = archiveEntry.key
      onSelectArchiveEntry(archiveEntry)
    },
    [onSelectArchiveEntry],
  )

  useLayoutEffect(() => {
    if (
      pendingQuestionRevealKeyRef.current === null ||
      pendingQuestionRevealKeyRef.current !== displayedArchiveEntryKey
    ) {
      return
    }
    pendingQuestionRevealKeyRef.current = null
    const target = archiveSelectorRef.current
    if (target === null) return
    const frameId = globalThis.requestAnimationFrame(() => {
      scrollElementToScrollableStart(target)
    })
    return () => globalThis.cancelAnimationFrame(frameId)
  }, [displayedArchiveEntryKey])

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
      </Card>

      <ExaminationControlsCard
        questionCount={questionCount}
        showAnswers={showAnswers}
        blocker={blocker}
        isGenerating={isLoading}
        canRegenerate={!isLoading && exactHasResults && blocker === null}
        canToggleAnswers={hasDisplayResults}
        canCopyMarkdown={displayEntry?.status === "loaded"}
        onQuestionCountChange={onQuestionCountChange}
        onShowAnswersChange={onShowAnswersChange}
        onGenerate={onGenerate}
        onStopGeneration={onStopGeneration}
        onRegenerate={onRegenerate}
        onCopyMarkdown={onCopyMarkdown}
      />

      {showArchiveSelector ? (
        <div ref={archiveSelectorRef}>
          <ArchiveSetSelector
            entries={archiveEntries}
            selectedKey={displayedArchiveEntry?.key ?? null}
            onSelect={selectArchiveEntry}
          />
        </div>
      ) : null}

      <ExaminationQuestionDisplay
        entry={entry}
        displayedArchiveEntry={displayedArchiveEntry}
        questionCount={questionCount}
        showAnswers={showAnswers}
        layout={layout}
        scrollResetKey={displayedArchiveEntryKey}
        emptyMessage="Click Generate to produce questions for this author."
      />
    </div>
  )
}

function scrollElementToScrollableStart(element: HTMLElement): void {
  const scrollParent = findVerticalScrollParent(element)
  if (scrollParent === null) {
    element.scrollIntoView({ block: "start", inline: "nearest" })
    return
  }

  const parentRect = scrollParent.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  scrollParent.scrollTo({
    top: scrollParent.scrollTop + elementRect.top - parentRect.top,
  })
}

function findVerticalScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement
  while (parent !== null) {
    const overflowY = globalThis.getComputedStyle(parent).overflowY
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    if (canScroll) return parent
    parent = parent.parentElement
  }
  return null
}
