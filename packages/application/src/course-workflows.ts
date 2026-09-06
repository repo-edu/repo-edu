import {
  type AppError,
  createCourseStorageFailure,
  type DiagnosticOutput,
  isAppError,
  type MilestoneProgress,
  type WorkflowCallOptions,
  type WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { validatePersistedCourse } from "@repo-edu/domain/schemas"
import type { CourseSummary, PersistedCourse } from "@repo-edu/domain/types"
import type { CourseStore } from "./core.js"
import { throwIfAborted, validateLoadedCourse } from "./workflow-helpers.js"

function summarizeCourse(course: PersistedCourse): CourseSummary {
  return {
    id: course.id,
    displayName: course.displayName,
    backing: course.backing,
    updatedAt: course.updatedAt,
  }
}

function sortCoursesByUpdatedAt(
  courses: readonly PersistedCourse[],
): PersistedCourse[] {
  return [...courses].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

async function runCourseStorage<T>(action: () => T | Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (isAppError(error) && error.type === "course-storage") throw error
    throw createCourseStorageFailure(
      error instanceof Error || isAppError(error)
        ? error.message
        : "The course storage action failed.",
    )
  }
}

export function createCourseWorkflowHandlers(
  courseStore: CourseStore,
): Pick<
  WorkflowHandlerMap<
    "course.list" | "course.load" | "course.save" | "course.delete"
  >,
  "course.list" | "course.load" | "course.save" | "course.delete"
> {
  return {
    "course.list": async (_input, options) => {
      throwIfAborted(options?.signal)
      const courses = await runCourseStorage(async () =>
        (await courseStore.listCourses(options?.signal)).map(
          validateLoadedCourse,
        ),
      )
      throwIfAborted(options?.signal)
      return sortCoursesByUpdatedAt(courses).map(summarizeCourse)
    },
    "course.load": async (
      input: { courseId: string },
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Resolving course from course store.",
      })
      throwIfAborted(options?.signal)
      const course = await runCourseStorage(async () => {
        const stored = await courseStore.loadCourse(
          input.courseId,
          options?.signal,
        )
        return stored === null ? null : validateLoadedCourse(stored)
      })
      throwIfAborted(options?.signal)
      if (course === null) {
        throw {
          type: "not-found",
          message: `Course '${input.courseId}' was not found.`,
          resource: "course",
        } satisfies AppError
      }
      options?.onOutput?.({
        channel: "info",
        message: `Loaded course ${course.displayName}.`,
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Course loaded.",
      })
      return course
    },
    "course.save": async (
      input: PersistedCourse,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating course payload.",
      })
      const validation = validatePersistedCourse(input)
      if (!validation.ok) {
        throw createCourseStorageFailure("Course validation failed.")
      }

      options?.onOutput?.({
        channel: "info",
        message: `Saving course ${validation.value.displayName}.`,
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing course to course store.",
      })
      const saveStamp = await runCourseStorage(() =>
        courseStore.saveCourse(validation.value, options?.signal),
      )

      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Course saved.",
      })
      return saveStamp
    },
    "course.delete": async (input: { courseId: string }, options) => {
      throwIfAborted(options?.signal)
      await runCourseStorage(() =>
        courseStore.deleteCourse(input.courseId, options?.signal),
      )
    },
  }
}
