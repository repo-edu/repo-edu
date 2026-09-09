import { activeCourseIdFromSurface } from "@repo-edu/domain/active-surface"
import type { AnalysisInputs, ValidationIssue } from "@repo-edu/domain/types"
import { useCallback, useMemo } from "react"
import {
  selectActiveSurface,
  selectFolderViewAnalysisInputs,
} from "../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../session/session-controller-context.js"
import { useCourseStore } from "../stores/course-store.js"
import { buildAnalysisRosterContext } from "../utils/analysis-roster-context.js"

const EMPTY_ANALYSIS_INPUTS: AnalysisInputs = {}

export function useAnalysisContext() {
  const controller = useSessionController()
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const course = useCourseStore((s) => s.course)
  const folderViewAnalysisInputs = useSessionControllerSelector(
    selectFolderViewAnalysisInputs,
  )

  const activeCourseId = activeCourseIdFromSurface(activeSurface)
  const courseContext =
    activeCourseId !== null && course?.id === activeCourseId ? course : null
  const kind =
    activeSurface.kind === "submission"
      ? "submission"
      : activeSurface.kind === "folder"
        ? "folder"
        : courseContext !== null
          ? "course"
          : "none"
  const searchFolder =
    activeSurface.kind === "folder"
      ? activeSurface.path
      : (courseContext?.searchFolder ?? null)
  const analysisInputs =
    activeSurface.kind === "folder"
      ? folderViewAnalysisInputs
      : (courseContext?.analysisInputs ?? EMPTY_ANALYSIS_INPUTS)
  const rosterContext = useMemo(
    () =>
      courseContext === null
        ? undefined
        : buildAnalysisRosterContext(courseContext),
    [courseContext],
  )

  /** Returns the issues that refused the patch; an empty list means it landed. */
  const setAnalysisInputs = useCallback(
    (patch: Partial<AnalysisInputs>): ValidationIssue[] => {
      if (activeSurface.kind === "folder")
        return controller.setFolderViewAnalysisInputs(patch)
      if (courseContext !== null)
        return controller.setAnalysisInputs(courseContext.id, patch)
      return []
    },
    [activeSurface.kind, controller, courseContext],
  )

  const updateCourseSearchFolder = useCallback(
    (path: string | null) => {
      if (courseContext === null) return
      controller.setSearchFolder(courseContext.id, path)
    },
    [controller, courseContext],
  )

  const activateFolderPath = useCallback(
    async (path: string) => {
      await controller.activateSurface({ kind: "folder", path })
    },
    [controller],
  )

  return useMemo(
    () => ({
      kind,
      activeSurface,
      course: courseContext,
      searchFolder,
      analysisInputs,
      rosterContext,
      setAnalysisInputs,
      updateCourseSearchFolder,
      activateFolderPath,
    }),
    [
      activateFolderPath,
      activeSurface,
      analysisInputs,
      courseContext,
      kind,
      rosterContext,
      searchFolder,
      setAnalysisInputs,
      updateCourseSearchFolder,
    ],
  )
}
