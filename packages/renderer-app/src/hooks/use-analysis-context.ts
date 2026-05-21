import type { AnalysisInputs } from "@repo-edu/domain/types"
import { useCallback, useMemo } from "react"
import { SETTINGS_SAVE_DEBOUNCE_MS } from "../constants/layout.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { selectActiveSurface, useUiStore } from "../stores/ui-store.js"
import { buildAnalysisRosterContext } from "../utils/analysis-roster-context.js"
import { debounceAsync } from "../utils/debounce.js"
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
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const activateSurface = useActiveSurfaceNavigation()
  const saveFolderInputsDebounced = useMemo(
    () => debounceAsync(saveAppSettings, SETTINGS_SAVE_DEBOUNCE_MS),
    [saveAppSettings],
  )

  const courseContext =
    activeSurface.kind === "course" && course?.id === activeSurface.courseId
      ? course
      : null
  const kind =
    activeSurface.kind === "folder"
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
        saveFolderInputsDebounced()
        return
      }
      if (courseContext !== null) {
        setCourseAnalysisInputs(patch)
      }
    },
    [
      activeSurface.kind,
      courseContext,
      saveFolderInputsDebounced,
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
