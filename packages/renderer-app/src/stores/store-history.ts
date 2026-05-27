import { useAnalysisStore } from "./analysis-store.js"
import {
  selectCanRedo,
  selectCanUndo,
  selectNextRedoDescription,
  selectNextUndoDescription,
  useCourseStore,
} from "./course-store.js"
import { useExaminationStore } from "./examination-store.js"
import { useUiStore } from "./ui-store.js"

export type StoreHistoryViewModel = {
  canUndo: boolean
  canRedo: boolean
  undoDescription: string | null
  redoDescription: string | null
  undo: () => void
  redo: () => void
}

export function useStoreHistoryPresenter(): StoreHistoryViewModel {
  const activeSurface = useUiStore((state) => state.activeSurface)
  const activeTab = useUiStore((state) => state.activeTab)
  const analysisView = useAnalysisStore((state) => state.activeView)

  const courseCanUndo = useCourseStore(selectCanUndo)
  const courseCanRedo = useCourseStore(selectCanRedo)
  const courseUndoDescription = useCourseStore(selectNextUndoDescription)
  const courseRedoDescription = useCourseStore(selectNextRedoDescription)
  const courseUndo = useCourseStore((state) => state.undo)
  const courseRedo = useCourseStore((state) => state.redo)

  const examinationCanUndo = useExaminationStore(
    (state) => state.history.length > 0,
  )
  const examinationCanRedo = useExaminationStore(
    (state) => state.future.length > 0,
  )
  const examinationUndoDescription = useExaminationStore((state) =>
    state.nextUndoDescription(),
  )
  const examinationRedoDescription = useExaminationStore((state) =>
    state.nextRedoDescription(),
  )
  const examinationUndo = useExaminationStore((state) => state.undo)
  const examinationRedo = useExaminationStore((state) => state.redo)

  const examinationVisible =
    activeSurface.kind === "submission" ||
    (activeTab === "analysis" && analysisView === "examination")

  if (examinationVisible) {
    return {
      canUndo: examinationCanUndo,
      canRedo: examinationCanRedo,
      undoDescription: examinationUndoDescription,
      redoDescription: examinationRedoDescription,
      undo: () => {
        examinationUndo()
      },
      redo: () => {
        examinationRedo()
      },
    }
  }

  return {
    canUndo: courseCanUndo,
    canRedo: courseCanRedo,
    undoDescription: courseUndoDescription,
    redoDescription: courseRedoDescription,
    undo: () => {
      courseUndo()
    },
    redo: () => {
      courseRedo()
    },
  }
}
