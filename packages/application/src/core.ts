import type {
  AppError,
  AppValidationIssue,
  CourseSaveStamp,
} from "@repo-edu/application-contract"
import { packageId as contractPackageId } from "@repo-edu/application-contract"
import { formatSmokeWorkflowMessage } from "@repo-edu/domain/schemas"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  packageId as domainPackageId,
  type GitIdentityMode,
  type PersistedCourse,
  type RosterValidationResult,
} from "@repo-edu/domain/types"
import {
  validateAssignment,
  validateAssignmentWithTemplate,
  validateRoster,
} from "@repo-edu/domain/validation"
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

export type PersistenceWriteErrorKind =
  | "busy"
  | "locked"
  | "transient"
  | "permanent-io"
  | "decode"

const persistenceWriteErrorKinds = new Set<string>([
  "busy",
  "locked",
  "transient",
  "permanent-io",
  "decode",
])

export class PersistenceWriteError extends Error {
  readonly kind: PersistenceWriteErrorKind
  override readonly cause?: unknown

  constructor(
    kind: PersistenceWriteErrorKind,
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = "PersistenceWriteError"
    this.kind = kind
    this.cause = cause
  }
}

export function createPersistenceWriteError(
  kind: PersistenceWriteErrorKind,
  message: string,
  cause?: unknown,
): PersistenceWriteError {
  return new PersistenceWriteError(kind, message, cause)
}

export function classifyPersistenceWriteErrorCode(
  code: string | undefined,
): PersistenceWriteErrorKind {
  if (code === "EBUSY" || code === "EAGAIN" || code === "ETXTBSY") {
    return "busy"
  }
  if (code === "EPERM" || code === "EACCES") {
    return "locked"
  }
  if (code === "EMFILE" || code === "ENFILE" || code === "EINTR") {
    return "transient"
  }
  return "permanent-io"
}

export function isPersistenceWriteError(
  value: unknown,
): value is PersistenceWriteError {
  return (
    value instanceof PersistenceWriteError ||
    (typeof value === "object" &&
      value !== null &&
      "name" in value &&
      value.name === "PersistenceWriteError" &&
      "kind" in value &&
      typeof value.kind === "string" &&
      persistenceWriteErrorKinds.has(value.kind) &&
      "message" in value &&
      typeof value.message === "string")
  )
}

export type CourseSaveConflictReason = "revision-invariant" | "course-missing"

const courseSaveConflictReasons = new Set<string>([
  "revision-invariant",
  "course-missing",
])

export class CourseSaveConflictError extends Error {
  readonly reason: CourseSaveConflictReason
  readonly courseId: string
  readonly expectedRevision: number
  readonly storedRevision: number | null

  constructor(params: {
    reason: CourseSaveConflictReason
    courseId: string
    expectedRevision: number
    storedRevision: number | null
  }) {
    super(formatCourseSaveConflictMessage(params))
    this.name = "CourseSaveConflictError"
    this.reason = params.reason
    this.courseId = params.courseId
    this.expectedRevision = params.expectedRevision
    this.storedRevision = params.storedRevision
  }
}

export function createCourseSaveConflictError(params: {
  reason: CourseSaveConflictReason
  courseId: string
  expectedRevision: number
  storedRevision: number | null
}): CourseSaveConflictError {
  return new CourseSaveConflictError(params)
}

export function isCourseSaveConflictError(
  value: unknown,
): value is CourseSaveConflictError {
  return (
    value instanceof CourseSaveConflictError ||
    (typeof value === "object" &&
      value !== null &&
      "name" in value &&
      value.name === "CourseSaveConflictError" &&
      "reason" in value &&
      typeof value.reason === "string" &&
      courseSaveConflictReasons.has(value.reason) &&
      "courseId" in value &&
      typeof value.courseId === "string" &&
      "expectedRevision" in value &&
      typeof value.expectedRevision === "number")
  )
}

function formatCourseSaveConflictMessage(params: {
  reason: CourseSaveConflictReason
  courseId: string
  expectedRevision: number
  storedRevision: number | null
}): string {
  if (params.reason === "course-missing") {
    return `Course '${params.courseId}' no longer exists.`
  }

  if (params.storedRevision === null) {
    return `Course revision invariant violated for '${params.courseId}' (expected ${params.expectedRevision}, stored missing course).`
  }

  return `Course revision invariant violated for '${params.courseId}' (expected ${params.expectedRevision}, stored ${params.storedRevision}).`
}

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
  ): Promise<CourseSaveStamp> | CourseSaveStamp
  deleteCourse(courseId: string, signal?: AbortSignal): Promise<void> | void
}

export type AppSettingsStore = {
  loadSettings(
    signal?: AbortSignal,
  ): Promise<PersistedAppSettings | null> | PersistedAppSettings | null
  saveSettings(
    settings: PersistedAppSettings,
    signal?: AbortSignal,
  ): Promise<void> | void
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
        throw createCourseSaveConflictError({
          reason: "revision-invariant",
          courseId: course.id,
          expectedRevision: course.revision,
          storedRevision: current.revision,
        })
      }
      if (current === null && course.revision !== 0) {
        throw createCourseSaveConflictError({
          reason: "course-missing",
          courseId: course.id,
          expectedRevision: course.revision,
          storedRevision: null,
        })
      }

      const savedCourse: PersistedCourse = {
        ...course,
        revision: course.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      coursesById.set(course.id, savedCourse)
      return {
        revision: savedCourse.revision,
        updatedAt: savedCourse.updatedAt,
      }
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
    },
  }
}
