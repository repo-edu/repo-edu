import type { CourseBacking, PersistedCourse } from "@repo-edu/domain/types"
import { useCallback } from "react"
import { useSessionController } from "../session/session-controller-context.js"
import type { SessionStart } from "../session/session-start.js"
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
  const controller = useSessionController()

  const switchCourse = useCallback(
    async (start: SessionStart, courseId: string) => {
      await controller.activateSurface(start, { kind: "course", courseId })
    },
    [controller],
  )

  const createCourse = useCallback(
    async (
      start: SessionStart,
      input: CreateCourseInput,
    ): Promise<PersistedCourse | null> => {
      const addToast = useToastStore.getState().addToast
      try {
        return await controller.createCourse(start, input)
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to create course: ${message}`, { tone: "error" })
        return null
      }
    },
    [controller],
  )

  const duplicateCourse = useCallback(
    async (
      start: SessionStart,
      sourceId: string,
      displayName: string,
    ): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      try {
        await controller.duplicateCourse(start, sourceId, displayName)
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to duplicate course: ${message}`, {
          tone: "error",
        })
        return false
      }
    },
    [controller],
  )

  const renameCourse = useCallback(
    async (
      start: SessionStart,
      courseId: string,
      newDisplayName: string,
    ): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      if (!newDisplayName.trim()) return false

      try {
        await controller.renameCourse(start, courseId, newDisplayName)
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to rename course: ${message}`, { tone: "error" })
        return false
      }
    },
    [controller],
  )

  const deleteCourse = useCallback(
    async (start: SessionStart, courseId: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast

      try {
        await controller.deleteCourse(start, courseId)
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to delete course: ${message}`, { tone: "error" })
        return false
      }
    },
    [controller],
  )

  return {
    courses: courseList,
    createCourse,
    switchCourse,
    duplicateCourse,
    renameCourse,
    deleteCourse,
  }
}
