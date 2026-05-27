import type { PersistedLlmConnection } from "@repo-edu/domain/settings"
import {
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
} from "@repo-edu/ui"
import { type ReactNode, useCallback, useRef } from "react"
import {
  EXAMINATION_SUBMISSION_SIDEBAR_DEFAULT_WIDTH_PX,
  EXAMINATION_SUBMISSION_SIDEBAR_MAX_WIDTH_PX,
  EXAMINATION_SUBMISSION_SIDEBAR_MIN_WIDTH_PX,
} from "../../../constants/layout.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { ArchiveSetSelector } from "./ArchiveSetSelector.js"
import type { ExaminationDisplaySelection } from "./display-selectors.js"
import { ExaminationControlsCard } from "./ExaminationControlsCard.js"
import { ExaminationQuestionDisplay } from "./ExaminationQuestionDisplay.js"
import { LlmControls } from "./LlmControls.js"
import type { AvailableArchiveEntry } from "./types.js"

type SubmissionExaminationPaneProps = {
  sidebarContent?: ReactNode
  connections: PersistedLlmConnection[]
  activeConnection: PersistedLlmConnection | null
  selectedModelCode: string | null
  onSelectConnection: (id: string) => void
  onSelectModelCode: (code: string) => void
  onOpenSettings: () => void
  onImportArchive: () => void
  onExportArchive: () => void

  display: ExaminationDisplaySelection
  archiveEntries: AvailableArchiveEntry[]
  showArchiveSelector: boolean
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onSelectArchiveEntry: (entry: AvailableArchiveEntry) => void
  onGenerate: () => void
  onStopGeneration: () => void
  onRegenerate: () => void
  onCopyMarkdown: () => void
  emptyMessage: string
}

function clampSidebarWidthPx(size: number | null | undefined): number {
  const value = size ?? EXAMINATION_SUBMISSION_SIDEBAR_DEFAULT_WIDTH_PX
  return Math.min(
    EXAMINATION_SUBMISSION_SIDEBAR_MAX_WIDTH_PX,
    Math.max(EXAMINATION_SUBMISSION_SIDEBAR_MIN_WIDTH_PX, value),
  )
}

export function SubmissionExaminationPane({
  sidebarContent,
  connections,
  activeConnection,
  selectedModelCode,
  onSelectConnection,
  onSelectModelCode,
  onOpenSettings,
  onImportArchive,
  onExportArchive,
  display,
  archiveEntries,
  showArchiveSelector,
  questionCount,
  showAnswers,
  blocker,
  onQuestionCountChange,
  onShowAnswersChange,
  onSelectArchiveEntry,
  onGenerate,
  onStopGeneration,
  onRegenerate,
  onCopyMarkdown,
  emptyMessage,
}: SubmissionExaminationPaneProps) {
  const initialSidebarWidthPxRef = useRef(
    clampSidebarWidthPx(
      useAppSettingsStore.getState().settings.examinationSubmissionSidebarSize,
    ),
  )
  const sidebarPanelRef = useRef<ResizablePanelHandle | null>(null)

  const handleLayoutChanged = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    const { setExaminationSubmissionSidebarSize } =
      useAppSettingsStore.getState()
    const nextSize = clampSidebarWidthPx(panel.getSize().inPixels)
    const currentSize = clampSidebarWidthPx(
      useAppSettingsStore.getState().settings.examinationSubmissionSidebarSize,
    )
    if (nextSize === currentSize) return
    setExaminationSubmissionSidebarSize(nextSize)
  }, [])

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="flex-1 min-h-0"
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id="examination-submission-sidebar"
        panelRef={sidebarPanelRef}
        defaultSize={`${initialSidebarWidthPxRef.current}px`}
        minSize={`${EXAMINATION_SUBMISSION_SIDEBAR_MIN_WIDTH_PX}px`}
        maxSize={`${EXAMINATION_SUBMISSION_SIDEBAR_MAX_WIDTH_PX}px`}
        groupResizeBehavior="preserve-pixel-size"
        className="min-w-0"
      >
        <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-2">
          {sidebarContent}
          <section className="grid gap-3">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">Examination</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={onImportArchive}>
                    Import archive...
                  </Button>
                  <Button variant="outline" size="sm" onClick={onExportArchive}>
                    Export archive...
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Generate oral exam questions from the selected submission files.
              </p>
            </div>
            <LlmControls
              connections={connections}
              activeConnection={activeConnection}
              selectedModelCode={selectedModelCode}
              onSelectConnection={onSelectConnection}
              onSelectModelCode={onSelectModelCode}
              onOpenSettings={onOpenSettings}
            />
            <p className="rounded border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
              Provider prompts use redacted excerpts, but local code may still
              contain personal data after best-effort redaction.
            </p>
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
          </section>
        </div>
      </ResizablePanel>
      <ResizableHandle className="aria-[orientation=vertical]:w-px aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1 aria-[orientation=vertical]:after:w-2" />
      <ResizablePanel className="min-w-0">
        <div className="flex h-full min-h-0 flex-col gap-3 pl-2">
          {showArchiveSelector ? (
            <ArchiveSetSelector
              entries={archiveEntries}
              selectedKey={display.archiveEntry?.key ?? null}
              onSelect={onSelectArchiveEntry}
            />
          ) : null}
          <ExaminationQuestionDisplay
            display={display}
            questionCount={questionCount}
            showAnswers={showAnswers}
            layout="pane"
            scrollResetKey={display.archiveEntry?.key ?? null}
            emptyMessage={emptyMessage}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
