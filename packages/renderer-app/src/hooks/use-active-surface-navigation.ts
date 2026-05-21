import {
  normalizeActiveSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/settings"
import type { ActiveTab, CourseBacking } from "@repo-edu/domain/types"
import { useCallback } from "react"
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

function sameSurface(
  left: PersistedActiveSurface,
  right: PersistedActiveSurface,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === "course" && right.kind === "course") {
    return left.courseId === right.courseId
  }
  if (left.kind === "folder" && right.kind === "folder") {
    return left.path === right.path
  }
  return true
}

function resolveCourseBacking(
  surface: PersistedActiveSurface,
  explicitBacking: CourseBacking | undefined,
): CourseBacking | undefined {
  if (surface.kind !== "course") return undefined
  if (explicitBacking !== undefined) return explicitBacking
  const loadedCourse = useCourseStore.getState().course
  if (loadedCourse?.id === surface.courseId) {
    return loadedCourse.backing
  }
  return useUiStore
    .getState()
    .courseList.find((course) => course.id === surface.courseId)?.backing
}

export async function activateActiveSurface(
  surface: PersistedActiveSurface,
  options: ActiveSurfaceNavigationOptions = {},
): Promise<boolean> {
  const nextSurface = normalizeActiveSurface(surface)
  const uiState = useUiStore.getState()
  const currentSurface = uiState.activeSurface
  const leavingCourse =
    currentSurface.kind === "course" &&
    !sameSurface(currentSurface, nextSurface)

  if (leavingCourse && options.skipCourseFlush !== true) {
    try {
      const saved = await useCourseStore.getState().save()
      if (!saved) {
        return false
      }
    } catch {
      return false
    }
  }

  const courseBacking = resolveCourseBacking(nextSurface, options.courseBacking)
  const tabBacking = surfaceTabBacking(nextSurface, courseBacking)
  const nextTab =
    options.preferredTab ??
    resolveSupportedActiveTab(useUiStore.getState().activeTab, tabBacking)

  if (!sameSurface(currentSurface, nextSurface)) {
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

  try {
    await settingsStore.save()
  } catch {
    // Navigation remains usable even if settings persistence fails; the
    // settings store already records the error state for the banner/sheet.
  }

  return true
}

export function useActiveSurfaceNavigation() {
  return useCallback(activateActiveSurface, [])
}
