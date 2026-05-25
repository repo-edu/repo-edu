import {
  activeCourseIdFromSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/settings"
import {
  type CourseBacking,
  type CourseSummary,
  createBlankCourse,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import { useCallback } from "react"
import {
  getWorkflowClient,
  useWorkflowClient,
} from "../contexts/workflow-client.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { selectActiveCourseId, useUiStore } from "../stores/ui-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { generateCourseId } from "../utils/nanoid.js"
import { useActiveSurfaceNavigation } from "./use-active-surface-navigation.js"

type CreateCourseInput = {
  backing: CourseBacking
  displayName: string
  lmsConnectionName?: string | null
  lmsCourseId?: string | null
}

function initialTabForBacking(backing: CourseBacking) {
  if (backing === "lms") return "roster"
  return "groups-assignments"
}

export function resolveActiveSurfaceRedirectForCourses(
  activeSurface: PersistedActiveSurface,
  courses: readonly Pick<CourseSummary, "id" | "backing">[],
): { surface: PersistedActiveSurface; courseBacking?: CourseBacking } | null {
  const activeCourseId = activeCourseIdFromSurface(activeSurface)
  const activeCourseSummary =
    activeCourseId === null
      ? null
      : (courses.find((course) => course.id === activeCourseId) ?? null)

  if (
    activeSurface.kind === "submission" &&
    activeSurface.courseId !== undefined &&
    activeCourseSummary !== null &&
    activeCourseSummary.backing !== "lms"
  ) {
    return {
      surface: { kind: "course", courseId: activeSurface.courseId },
      courseBacking: activeCourseSummary.backing,
    }
  }

  if (activeCourseId !== null && activeCourseSummary === null) {
    const fallback = courses[0] ?? null
    if (fallback === null) {
      return { surface: { kind: "home" } }
    }
    return {
      surface: { kind: "course", courseId: fallback.id },
      courseBacking: fallback.backing,
    }
  }

  return null
}

export function pruneLoadedSubmissionFoldersForCourses(
  courses: readonly Pick<PersistedCourse, "id" | "backing">[],
): boolean {
  const settingsStore = useAppSettingsStore.getState()
  if (settingsStore.status !== "loaded") return false
  if (!settingsStore.pruneSubmissionFoldersForCourses(courses)) return false
  void useAppSettingsStore.getState().save()
  return true
}

export function useCourses() {
  const courseList = useUiStore((s) => s.courseList)
  const loading = useUiStore((s) => s.courseListLoading)
  const client = useWorkflowClient()
  const activateSurface = useActiveSurfaceNavigation()

  const refresh = useCallback(async () => {
    useUiStore.getState().setCourseListLoading(true)
    try {
      const list = await client.run("course.list", undefined)
      useUiStore.getState().setCourseList(list)
      pruneLoadedSubmissionFoldersForCourses(list)
      const redirect = resolveActiveSurfaceRedirectForCourses(
        useUiStore.getState().activeSurface,
        list,
      )
      if (redirect !== null) {
        await activateSurface(redirect.surface, {
          courseBacking: redirect.courseBacking,
          skipCourseFlush: true,
        })
      }
    } finally {
      useUiStore.getState().setCourseListLoading(false)
    }
  }, [activateSurface, client])

  const switchCourse = useCallback(
    async (courseId: string, backing?: CourseBacking) => {
      await activateSurface(
        { kind: "course", courseId },
        { courseBacking: backing },
      )
    },
    [activateSurface],
  )

  const createCourse = useCallback(
    async (input: CreateCourseInput): Promise<PersistedCourse | null> => {
      const addToast = useToastStore.getState().addToast
      try {
        const backing = input.backing
        const wfClient = getWorkflowClient()
        const draft = createBlankCourse(
          generateCourseId(),
          new Date().toISOString(),
          {
            backing,
            displayName: input.displayName,
            lmsConnectionName:
              backing === "lms" ? (input.lmsConnectionName ?? null) : null,
            lmsCourseId: backing === "lms" ? (input.lmsCourseId ?? null) : null,
          },
        )
        const saved = await wfClient.run("course.save", draft)
        await refresh()

        useAppSettingsStore.getState().setLastUsedCourseBacking(saved.backing)
        await activateSurface(
          { kind: "course", courseId: saved.id },
          {
            courseBacking: saved.backing,
            preferredTab: initialTabForBacking(saved.backing),
          },
        )

        return saved
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to create course: ${message}`, { tone: "error" })
        return null
      }
    },
    [activateSurface, refresh],
  )

  const duplicateCourse = useCallback(
    async (sourceId: string, displayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      try {
        const wfClient = getWorkflowClient()
        const source = await wfClient.run("course.load", {
          courseId: sourceId,
        })

        const duplicate = createBlankCourse(
          generateCourseId(),
          new Date().toISOString(),
          {
            backing: source.backing,
            displayName,
            lmsConnectionName: source.lmsConnectionName,
            organization: source.organization,
            lmsCourseId: source.lmsCourseId,
            repositoryTemplate: source.repositoryTemplate,
            searchFolder: source.searchFolder,
            analysisInputs: { ...source.analysisInputs },
          },
        )

        await wfClient.run("course.save", duplicate)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to duplicate course: ${message}`, {
          tone: "error",
        })
        return false
      }
    },
    [refresh],
  )

  const renameCourse = useCallback(
    async (courseId: string, newDisplayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      if (!newDisplayName.trim()) return false

      try {
        const wfClient = getWorkflowClient()
        const course = await wfClient.run("course.load", { courseId })

        const updated: PersistedCourse = {
          ...course,
          displayName: newDisplayName.trim(),
        }

        await wfClient.run("course.save", updated)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to rename course: ${message}`, { tone: "error" })
        return false
      }
    },
    [refresh],
  )

  const deleteCourse = useCallback(
    async (courseId: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      const activeCourseId = selectActiveCourseId(useUiStore.getState())
      const courses = useUiStore.getState().courseList
      const isActive = courseId === activeCourseId
      const remaining = courses.filter((p) => p.id !== courseId)

      try {
        const wfClient = getWorkflowClient()
        await wfClient.run("course.delete", { courseId })

        if (isActive) {
          // Prevent the next course load from trying to autosave a now-deleted course.
          useCourseStore.getState().clear()
          if (remaining.length > 0) {
            await activateSurface(
              { kind: "course", courseId: remaining[0].id },
              {
                courseBacking: remaining[0].backing,
                skipCourseFlush: true,
              },
            )
          } else {
            await activateSurface({ kind: "home" }, { skipCourseFlush: true })
          }
        }

        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to delete course: ${message}`, { tone: "error" })
        return false
      }
    },
    [activateSurface, refresh],
  )

  return {
    courses: courseList,
    loading,
    refresh,
    createCourse,
    switchCourse,
    duplicateCourse,
    renameCourse,
    deleteCourse,
  }
}
