import { activeCourseIdFromSurface } from "@repo-edu/domain/settings"
import type { AnalysisInputs } from "@repo-edu/domain/types"
import { useCallback, useMemo } from "react"
import { selectActiveSurface } from "../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../session/session-controller-context.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { buildAnalysisRosterContext } from "../utils/analysis-roster-context.js"

const EMPTY_ANALYSIS_INPUTS: AnalysisInputs = {}

export function useAnalysisContext() {
  const controller = useSessionController()
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const course = useCourseStore((s) => s.course)
  const folderViewAnalysisInputs = useAppSettingsStore(
    (s) => s.settings.folderViewAnalysisInputs,
  )
  const setFolderViewAnalysisInputs = useAppSettingsStore(
    (s) => s.setFolderViewAnalysisInputs,
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

  const setAnalysisInputs = useCallback(
    (patch: Partial<AnalysisInputs>) => {
      if (activeSurface.kind === "folder") {
        setFolderViewAnalysisInputs(patch)
        return
      }
      if (courseContext !== null) {
        controller.setAnalysisInputs(courseContext.id, patch)
      }
    },
    [
      activeSurface.kind,
      controller,
      courseContext,
      setFolderViewAnalysisInputs,
    ],
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
