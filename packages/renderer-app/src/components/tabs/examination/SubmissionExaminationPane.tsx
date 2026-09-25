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
import { selectPreferences } from "../../../session/selectors.js"
import { useSessionController } from "../../../session/session-controller-context.js"
import { ArchiveSetSelector } from "./ArchiveSetSelector.js"
import { ExaminationControlsCard } from "./ExaminationControlsCard.js"
import { ExaminationQuestionDisplay } from "./ExaminationQuestionDisplay.js"
import { LlmControls } from "./LlmControls.js"
import type { ExaminationEngineViewModel } from "./use-examination-engine.js"

type SubmissionExaminationPaneProps = {
  sidebarContent?: ReactNode
  engine: ExaminationEngineViewModel
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
  engine,
  emptyMessage,
}: SubmissionExaminationPaneProps) {
  const controller = useSessionController()
  const initialSidebarWidthPxRef = useRef(
    clampSidebarWidthPx(
      selectPreferences(controller.getSnapshot())
        .examinationSubmissionSidebarSize,
    ),
  )
  const sidebarPanelRef = useRef<ResizablePanelHandle | null>(null)

  const handleLayoutChanged = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    const nextSize = clampSidebarWidthPx(panel.getSize().inPixels)
    const currentSize = clampSidebarWidthPx(
      selectPreferences(controller.getSnapshot())
        .examinationSubmissionSidebarSize,
    )
    if (nextSize === currentSize) return
    controller.setExaminationSubmissionSidebarSize(nextSize)
  }, [controller])

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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={engine.commands.importArchive}
                  >
                    Import archive...
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={engine.commands.exportArchive}
                  >
                    Export archive...
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Generate oral exam questions from the selected submission files.
              </p>
            </div>
            <LlmControls
              connections={engine.connections}
              activeConnection={engine.activeConnection}
              selectedModelCode={engine.selectedModelCode}
              onSelectConnection={engine.commands.selectConnection}
              onSelectModelCode={engine.commands.selectModelCode}
              onOpenSettings={engine.commands.openLlmSettings}
            />
            <p className="rounded border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
              Provider prompts use redacted excerpts, but local code may still
              contain personal data after best-effort redaction.
            </p>
            <ExaminationControlsCard
              questionCount={engine.questionCount}
              showAnswers={engine.showAnswers}
              blocker={engine.blocker}
              isGenerating={engine.isGenerating}
              hasLoadedQuestions={engine.hasLoadedQuestions}
              onLoadQuestions={engine.commands.loadQuestions}
              canRegenerate={engine.display.canRegenerate}
              canToggleAnswers={engine.display.canToggleAnswers}
              canCopyMarkdown={engine.display.canCopyMarkdown}
              onQuestionCountChange={engine.commands.changeQuestionCount}
              onShowAnswersChange={engine.commands.changeShowAnswers}
              onGenerate={engine.commands.generate}
              onStopGeneration={engine.commands.stopGeneration}
              onRegenerate={engine.commands.regenerate}
              onCopyMarkdown={engine.commands.copyMarkdown}
            />
          </section>
        </div>
      </ResizablePanel>
      <ResizableHandle className="aria-[orientation=vertical]:w-px aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1 aria-[orientation=vertical]:after:w-2" />
      <ResizablePanel className="min-w-0">
        <div className="flex h-full min-h-0 flex-col gap-3 pl-2">
          {engine.showArchiveSelector ? (
            <ArchiveSetSelector
              entries={engine.archiveEntries}
              selectedKey={engine.display.archiveEntry?.key ?? null}
              onSelect={engine.commands.selectArchiveEntry}
            />
          ) : null}
          <ExaminationQuestionDisplay
            display={engine.display}
            questionCount={engine.questionCount}
            showAnswers={engine.showAnswers}
            layout="pane"
            scrollResetKey={engine.display.archiveEntry?.key ?? null}
            emptyMessage={emptyMessage}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
