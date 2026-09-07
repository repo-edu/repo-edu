import type { CourseBacking, PersistedCourse } from "@repo-edu/domain/types"
import { useCallback } from "react"
import { useSessionController } from "../session/session-controller-context.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"
import { getErrorMessage } from "../utils/error-message.js"

type CreateCourseInput = {
  backing: CourseBacking
  displayName: string
  lmsConnectionId?: string | null
  lmsCourseId?: string | null
}

export function useCourses() {
  const courseList = useUiStore((s) => s.courseList)
  const loading = useUiStore((s) => s.courseListLoading)
  const controller = useSessionController()

  const refresh = useCallback(() => controller.refreshCourses(), [controller])

  const switchCourse = useCallback(
    async (courseId: string, backing?: CourseBacking) => {
      void backing
      await controller.activateSurface({ kind: "course", courseId })
    },
    [controller],
  )

  const createCourse = useCallback(
    async (input: CreateCourseInput): Promise<PersistedCourse | null> => {
      const addToast = useToastStore.getState().addToast
      try {
        const draft = await controller.createCourse(input)
        await refresh()
        return draft
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to create course: ${message}`, { tone: "error" })
        return null
      }
    },
    [controller, refresh],
  )

  const duplicateCourse = useCallback(
    async (sourceId: string, displayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      try {
        await controller.duplicateCourse(sourceId, displayName)
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
    [controller, refresh],
  )

  const renameCourse = useCallback(
    async (courseId: string, newDisplayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      if (!newDisplayName.trim()) return false

      try {
        await controller.renameCourse(courseId, newDisplayName)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to rename course: ${message}`, { tone: "error" })
        return false
      }
    },
    [controller, refresh],
  )

  const deleteCourse = useCallback(
    async (courseId: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast

      try {
        await controller.deleteCourse(courseId)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to delete course: ${message}`, { tone: "error" })
        return false
      }
    },
    [controller, refresh],
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
