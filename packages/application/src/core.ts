import type {
  AppError,
  AppValidationIssue,
} from "@repo-edu/application-contract"
import { packageId as contractPackageId } from "@repo-edu/application-contract"
import type {
  GitIdentityMode,
  PersistedAppSettings,
  PersistedCourse,
  RosterValidationResult,
} from "@repo-edu/domain"
import {
  packageId as domainPackageId,
  formatSmokeWorkflowMessage,
  validateAssignment,
  validateAssignmentWithTemplate,
  validateRoster,
} from "@repo-edu/domain"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
import { packageId as gitContractPackageId } from "@repo-edu/integrations-git-contract"
import { packageId as lmsContractPackageId } from "@repo-edu/integrations-lms-contract"

export const packageId = "@repo-edu/application"
export const workspaceDependencies = [
  contractPackageId,
  domainPackageId,
  hostRuntimePackageId,
  gitContractPackageId,
  lmsContractPackageId,
] as const

export type SmokeWorkflowResult = {
  workflowId: "phase-1.docs.smoke"
  message: string
  packageLine: string
  executedAt: string
}

export type CourseStore = {
  listCourses(
    signal?: AbortSignal,
  ): Promise<PersistedCourse[]> | PersistedCourse[]
  loadCourse(
    courseId: string,
    signal?: AbortSignal,
  ): Promise<PersistedCourse | null> | PersistedCourse | null
  saveCourse(
    course: PersistedCourse,
    signal?: AbortSignal,
  ): Promise<PersistedCourse> | PersistedCourse
  deleteCourse(courseId: string, signal?: AbortSignal): Promise<void> | void
}

export type AppSettingsStore = {
  loadSettings(
    signal?: AbortSignal,
  ): Promise<PersistedAppSettings | null> | PersistedAppSettings | null
  saveSettings(
    settings: PersistedAppSettings,
    signal?: AbortSignal,
  ): Promise<PersistedAppSettings> | PersistedAppSettings
}

export async function runSmokeWorkflow(
  source: string,
): Promise<SmokeWorkflowResult> {
  return {
    workflowId: "phase-1.docs.smoke",
    message: formatSmokeWorkflowMessage(source),
    packageLine: [packageId, contractPackageId, domainPackageId].join(" -> "),
    executedAt: new Date().toISOString(),
  }
}

export function createValidationAppError(
  message: string,
  issues: AppValidationIssue[],
): AppError {
  return {
    type: "validation",
    message,
    issues,
  }
}

export function runValidateRosterForCourse(
  course: PersistedCourse,
): RosterValidationResult {
  return validateRoster(course.roster)
}

export function runValidateAssignmentForCourse(
  course: PersistedCourse,
  assignmentId: string,
  options?: {
    identityMode?: GitIdentityMode
    repoNameTemplate?: string
  },
): RosterValidationResult {
  if (options?.repoNameTemplate !== undefined) {
    return validateAssignmentWithTemplate(
      course.roster,
      assignmentId,
      options.identityMode ?? "username",
      options.repoNameTemplate,
    )
  }

  return validateAssignment(
    course.roster,
    assignmentId,
    options?.identityMode ?? "username",
  )
}

export function createInMemoryCourseStore(
  courses: readonly PersistedCourse[],
): CourseStore {
  const coursesById = new Map(
    courses.map((course) => [course.id, course] as const),
  )

  return {
    listCourses() {
      return [...coursesById.values()]
    },
    loadCourse(courseId: string) {
      return coursesById.get(courseId) ?? null
    },
    saveCourse(course: PersistedCourse) {
      const current = coursesById.get(course.id) ?? null
      if (current !== null && current.revision !== course.revision) {
        throw new Error(
          `Course revision invariant violated for '${course.id}' (expected ${course.revision}, stored ${current.revision}).`,
        )
      }
      if (current === null && course.revision !== 0) {
        throw new Error(
          `Course revision invariant violated for '${course.id}' (expected ${course.revision}, stored missing course).`,
        )
      }

      const savedCourse: PersistedCourse = {
        ...course,
        revision: course.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      coursesById.set(course.id, savedCourse)
      return savedCourse
    },
    deleteCourse(courseId: string) {
      coursesById.delete(courseId)
    },
  }
}

export function createInMemoryAppSettingsStore(
  settings: PersistedAppSettings | null = null,
): AppSettingsStore {
  let value = settings

  return {
    loadSettings() {
      return value
    },
    saveSettings(nextSettings: PersistedAppSettings) {
      value = nextSettings
      return nextSettings
    },
  }
}
