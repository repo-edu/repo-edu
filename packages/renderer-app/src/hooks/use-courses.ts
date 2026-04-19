import {
  initialIdSequences,
  type PersistedCourse,
  persistedCourseKind,
  type Roster,
} from "@repo-edu/domain/types"
import { useCallback } from "react"
import {
  getWorkflowClient,
  useWorkflowClient,
} from "../contexts/workflow-client.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { generateCourseId } from "../utils/nanoid.js"

const EMPTY_ROSTER: Roster = {
  connection: null,
  students: [],
  staff: [],
  groups: [],
  groupSets: [],
  assignments: [],
}

export function useCourses() {
  const courseList = useUiStore((s) => s.courseList)
  const loading = useUiStore((s) => s.courseListLoading)
  const client = useWorkflowClient()

  const refresh = useCallback(async () => {
    useUiStore.getState().setCourseListLoading(true)
    try {
      const list = await client.run("course.list", undefined)
      useUiStore.getState().setCourseList(list)
      const activeCourseId = useUiStore.getState().activeCourseId
      if (
        activeCourseId !== null &&
        !list.some((course) => course.id === activeCourseId)
      ) {
        useUiStore.getState().setActiveCourseId(null)
        useAppSettingsStore.getState().setActiveCourseId(null)
        try {
          await useAppSettingsStore.getState().save()
        } catch {
          // Keep refresh resilient even if settings persistence fails.
        }
      }
    } finally {
      useUiStore.getState().setCourseListLoading(false)
    }
  }, [client])

  const switchCourse = useCallback(async (courseId: string) => {
    useUiStore.getState().setActiveCourseId(courseId)
    useAppSettingsStore.getState().setActiveCourseId(courseId)
    try {
      await useAppSettingsStore.getState().save()
    } catch {
      // Keep course switching resilient even if settings persistence fails.
    }
  }, [])

  const duplicateCourse = useCallback(
    async (sourceId: string, displayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      try {
        const wfClient = getWorkflowClient()
        const source = await wfClient.run("course.load", {
          courseId: sourceId,
        })

        const duplicate: PersistedCourse = {
          kind: persistedCourseKind,
          revision: 0,
          id: generateCourseId(),
          displayName,
          lmsConnectionName: source.lmsConnectionName,
          organization: source.organization,
          lmsCourseId: source.lmsCourseId,
          idSequences: initialIdSequences(),
          roster: EMPTY_ROSTER,
          repositoryTemplate: source.repositoryTemplate,
          searchFolder: source.searchFolder,
          analysisInputs: { ...source.analysisInputs },
          updatedAt: new Date().toISOString(),
        }

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
      const activeCourseId = useUiStore.getState().activeCourseId
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
            await switchCourse(remaining[0].id)
          } else {
            useUiStore.getState().setActiveCourseId(null)
            useAppSettingsStore.getState().setActiveCourseId(null)
            try {
              await useAppSettingsStore.getState().save()
            } catch {
              // Keep delete resilient.
            }
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
    [refresh, switchCourse],
  )

  return {
    courses: courseList,
    loading,
    refresh,
    switchCourse,
    duplicateCourse,
    renameCourse,
    deleteCourse,
  }
}
