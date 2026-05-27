import {
  activeCourseIdFromSurface,
  activeSurfaceEquals,
  activeSurfaceRecentSubmission,
  normalizeActiveSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/settings"
import type { ActiveTab, CourseBacking } from "@repo-edu/domain/types"
import { useCallback } from "react"
import { getPersisterRegistry } from "../persistence/persister-registry.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  resolveSupportedActiveTab,
  surfaceTabBacking,
} from "../utils/course-navigation.js"

type ActiveSurfaceNavigationOptions = {
  recordRecent?: boolean
  preferredTab?: ActiveTab
  courseBacking?: CourseBacking
  skipCourseFlush?: boolean
}

function resolveCourseBacking(
  surface: PersistedActiveSurface,
  explicitBacking: CourseBacking | undefined,
): CourseBacking | undefined {
  const courseId = activeCourseIdFromSurface(surface)
  if (courseId === null) return undefined
  if (explicitBacking !== undefined) return explicitBacking
  const loadedCourse = useCourseStore.getState().course
  if (loadedCourse?.id === courseId) {
    return loadedCourse.backing
  }
  return useUiStore
    .getState()
    .courseList.find((course) => course.id === courseId)?.backing
}

export async function activateActiveSurface(
  surface: PersistedActiveSurface,
  options: ActiveSurfaceNavigationOptions = {},
): Promise<boolean> {
  const nextSurface = normalizeActiveSurface(surface)
  const uiState = useUiStore.getState()
  const currentSurface = uiState.activeSurface
  const leavingCourse =
    activeCourseIdFromSurface(currentSurface) !== null &&
    activeCourseIdFromSurface(currentSurface) !==
      activeCourseIdFromSurface(nextSurface)

  if (leavingCourse && options.skipCourseFlush !== true) {
    try {
      await getPersisterRegistry().course.flush()
    } catch {
      return false
    }
  }

  const courseBacking = resolveCourseBacking(nextSurface, options.courseBacking)
  const tabBacking = surfaceTabBacking(nextSurface, courseBacking)
  const nextTab =
    options.preferredTab ??
    resolveSupportedActiveTab(useUiStore.getState().activeTab, tabBacking)

  if (!activeSurfaceEquals(currentSurface, nextSurface)) {
    useAnalysisStore.getState().resetAnalysisContext()
  }
  useUiStore.getState().setActiveSurface(nextSurface)
  useUiStore.getState().setActiveTab(nextTab)

  const settingsStore = useAppSettingsStore.getState()
  settingsStore.setActiveSurface(nextSurface)
  settingsStore.setActiveTab(nextTab)
  if (nextSurface.kind === "folder" && options.recordRecent === true) {
    settingsStore.pushRecentFolder(nextSurface.path)
  }
  if (nextSurface.kind === "submission" && options.recordRecent === true) {
    const recent = activeSurfaceRecentSubmission(nextSurface)
    if (recent !== null) {
      settingsStore.pushRecentSubmissionFolder(recent)
    }
  }

  try {
    await getPersisterRegistry().appSettings.flush()
  } catch {
    // Navigation remains usable even if settings persistence fails; the
    // settings sync-status already records the error state for the banner.
  }

  return true
}

export function useActiveSurfaceNavigation() {
  return useCallback(activateActiveSurface, [])
}
