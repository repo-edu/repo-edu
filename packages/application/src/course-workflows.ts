import type {
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { validatePersistedCourse } from "@repo-edu/domain/schemas"
import type { CourseSummary, PersistedCourse } from "@repo-edu/domain/types"
import { type CourseStore, createValidationAppError } from "./core.js"
import {
  loadRequiredCourse,
  throwIfAborted,
  validateLoadedCourse,
} from "./workflow-helpers.js"

function summarizeCourse(course: PersistedCourse): CourseSummary {
  return {
    id: course.id,
    displayName: course.displayName,
    courseKind: course.courseKind,
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
      const courses = await courseStore.listCourses(options?.signal)
      throwIfAborted(options?.signal)
      return sortCoursesByUpdatedAt(courses)
        .map(validateLoadedCourse)
        .map(summarizeCourse)
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
      const course = await loadRequiredCourse(
        courseStore,
        input.courseId,
        options?.signal,
      )
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
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating course payload.",
      })
      const validation = validatePersistedCourse(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "Course validation failed.",
          validation.issues,
        )
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
      const savedCourse = await courseStore.saveCourse(
        validation.value,
        options?.signal,
      )
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Course saved.",
      })
      return savedCourse
    },
    "course.delete": async (input: { courseId: string }, options) => {
      throwIfAborted(options?.signal)
      await courseStore.deleteCourse(input.courseId, options?.signal)
    },
  }
}
