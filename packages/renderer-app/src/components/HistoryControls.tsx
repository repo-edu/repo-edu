import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo-edu/ui"
import { Redo2, Undo2 } from "@repo-edu/ui/components/icons"
import { useEffect } from "react"
import {
  selectActiveCourseId,
  selectActiveSurface,
  selectActiveTab,
} from "../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../session/session-controller-context.js"
import {
  selectCanRedo,
  selectCanUndo,
  selectNextRedoDescription,
  selectNextUndoDescription,
  useCourseStore,
} from "../stores/course-store.js"
import { isDocumentEditingSurface } from "../utils/history-boundary.js"

/** The undo and redo buttons of the top bar and their key bindings. Both act
 * only while a course document is being edited. */
export function HistoryControls() {
  const controller = useSessionController()
  const activeTab = useSessionControllerSelector(selectActiveTab)
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const activeCourseId = useSessionControllerSelector(selectActiveCourseId)
  const showHistoryControls = isDocumentEditingSurface(activeSurface, activeTab)
  const canUndo = useCourseStore(selectCanUndo)
  const canRedo = useCourseStore(selectCanRedo)
  const undoDescription = useCourseStore(selectNextUndoDescription)
  const redoDescription = useCourseStore(selectNextRedoDescription)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      controller.operations.change(() => {
        if (!(e.metaKey || e.ctrlKey)) return

        // Skip undo/redo when focus is in an input or textarea.
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA") return
        if (!showHistoryControls) return

        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault()
          if (activeCourseId !== null) controller.undo(activeCourseId)
          return
        }

        if ((e.key === "z" && e.shiftKey) || e.key === "Z") {
          e.preventDefault()
          if (activeCourseId !== null) controller.redo(activeCourseId)
        }
      })
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [activeCourseId, controller, showHistoryControls])

  if (!showHistoryControls) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!canUndo}
            onClick={() => {
              if (activeCourseId !== null) {
                controller.undo(activeCourseId)
              }
            }}
          >
            <Undo2 className="size-[18px]" />
            <span className="sr-only">Undo</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {undoDescription
            ? `Undo: ${undoDescription} (Ctrl+Z)`
            : "Undo (Ctrl+Z)"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!canRedo}
            onClick={() => {
              if (activeCourseId !== null) {
                controller.redo(activeCourseId)
              }
            }}
          >
            <Redo2 className="size-[18px]" />
            <span className="sr-only">Redo</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {redoDescription
            ? `Redo: ${redoDescription} (Ctrl+Shift+Z)`
            : "Redo (Ctrl+Shift+Z)"}
        </TooltipContent>
      </Tooltip>
    </>
  )
}
