import { activeCourseIdFromSurface } from "@repo-edu/domain/settings"
import type { AnalysisInputs } from "@repo-edu/domain/types"
import { useCallback } from "react"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { selectActiveSurface, useUiStore } from "../stores/ui-store.js"
import { buildAnalysisRosterContext } from "../utils/analysis-roster-context.js"
import { useActiveSurfaceNavigation } from "./use-active-surface-navigation.js"

export function useAnalysisContext() {
  const activeSurface = useUiStore(selectActiveSurface)
  const course = useCourseStore((s) => s.course)
  const setCourseAnalysisInputs = useCourseStore((s) => s.setAnalysisInputs)
  const setCourseSearchFolder = useCourseStore((s) => s.setSearchFolder)
  const folderViewAnalysisInputs = useAppSettingsStore(
    (s) => s.settings.folderViewAnalysisInputs,
  )
  const setFolderViewAnalysisInputs = useAppSettingsStore(
    (s) => s.setFolderViewAnalysisInputs,
  )
  const activateSurface = useActiveSurfaceNavigation()

  const courseContext =
    activeCourseIdFromSurface(activeSurface) !== null &&
    course?.id === activeCourseIdFromSurface(activeSurface)
      ? course
      : null
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
      : (courseContext?.analysisInputs ?? {})
  const rosterContext =
    courseContext === null
      ? undefined
      : buildAnalysisRosterContext(courseContext)

  const setAnalysisInputs = useCallback(
    (patch: Partial<AnalysisInputs>) => {
      if (activeSurface.kind === "folder") {
        setFolderViewAnalysisInputs(patch)
        return
      }
      if (courseContext !== null) {
        setCourseAnalysisInputs(patch)
      }
    },
    [
      activeSurface.kind,
      courseContext,
      setCourseAnalysisInputs,
      setFolderViewAnalysisInputs,
    ],
  )

  const updateCourseSearchFolder = useCallback(
    (path: string | null) => {
      if (courseContext === null) return
      setCourseSearchFolder(path)
    },
    [courseContext, setCourseSearchFolder],
  )

  const activateFolderPath = useCallback(
    async (path: string, recordRecent = true) => {
      await activateSurface(
        { kind: "folder", path },
        { recordRecent, preferredTab: "analysis" },
      )
    },
    [activateSurface],
  )

  return {
    kind,
    activeSurface,
    course: courseContext,
    searchFolder,
    analysisInputs,
    rosterContext,
    setAnalysisInputs,
    updateCourseSearchFolder,
    activateFolderPath,
  }
}
