import { Card, CardHeader, CardTitle } from "@repo-edu/ui"
import { useCallback, useLayoutEffect, useRef } from "react"
import { ArchiveSetSelector } from "./ArchiveSetSelector.js"
import type { ExaminationDisplaySelection } from "./display-selectors.js"
import { ExaminationControlsCard } from "./ExaminationControlsCard.js"
import { ExaminationQuestionDisplay } from "./ExaminationQuestionDisplay.js"
import type { SourceSubject } from "./source.js"
import type { AvailableArchiveEntry } from "./types.js"

type SubjectPanelProps = {
  subject: SourceSubject
  display: ExaminationDisplaySelection
  archiveEntries: AvailableArchiveEntry[]
  showArchiveSelector: boolean
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  rosterWarning: string | null
  layout: "page" | "pane"
  emptyMessage: string
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onSelectArchiveEntry: (entry: AvailableArchiveEntry) => void
  onGenerate: () => void
  onStopGeneration: () => void
  onRegenerate: () => void
  onCopyMarkdown: () => void
}

export function SubjectPanel({
  subject,
  display,
  archiveEntries,
  showArchiveSelector,
  questionCount,
  showAnswers,
  blocker,
  rosterWarning,
  layout,
  emptyMessage,
  onQuestionCountChange,
  onShowAnswersChange,
  onSelectArchiveEntry,
  onGenerate,
  onStopGeneration,
  onRegenerate,
  onCopyMarkdown,
}: SubjectPanelProps) {
  const archiveSelectorRef = useRef<HTMLDivElement>(null)
  const pendingQuestionRevealKeyRef = useRef<string | null>(null)
  const displayedArchiveEntryKey = display.archiveEntry?.key ?? null
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
          <CardTitle>{subject.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {subject.email} · {subject.lines} lines
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
        isGenerating={display.isLoading}
        canRegenerate={display.canRegenerate}
        canToggleAnswers={display.canToggleAnswers}
        canCopyMarkdown={display.canCopyMarkdown}
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
            selectedKey={display.archiveEntry?.key ?? null}
            onSelect={selectArchiveEntry}
          />
        </div>
      ) : null}

      <ExaminationQuestionDisplay
        display={display}
        questionCount={questionCount}
        showAnswers={showAnswers}
        layout={layout}
        scrollResetKey={displayedArchiveEntryKey}
        emptyMessage={emptyMessage}
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
