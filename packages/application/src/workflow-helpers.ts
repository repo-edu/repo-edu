import type {
  AppError,
  AppValidationIssue,
  UserFileRef,
  VerifyGitDraftInput,
  VerifyLmsDraftInput,
} from "@repo-edu/application-contract"
import {
  createCancelledAppError,
  isAppError,
} from "@repo-edu/application-contract"
import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import { normalizeRoster } from "@repo-edu/domain/roster"
import {
  type GitUsernameImportRow,
  gitUsernameImportRowSchema,
  groupSetImportRowSchema,
  type StudentImportRow,
  studentImportRowSchema,
  validatePersistedAppSettings,
  validatePersistedCourse,
} from "@repo-edu/domain/schemas"
import { defaultAppSettings } from "@repo-edu/domain/settings"
import {
  enrollmentTypeKinds,
  type GroupSetImportRow,
  type PersistedAppSettings,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import type { UserFileText } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import type { LmsConnectionDraft } from "@repo-edu/integrations-lms-contract"
import type { TabularRow } from "./adapters/tabular/types.js"
import type { AppSettingsStore, CourseStore } from "./core.js"
import { createValidationAppError } from "./core.js"

export function toCancelledAppError() {
  return createCancelledAppError()
}

export function isSharedAppError(value: unknown): value is AppError {
  return isAppError(value)
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw toCancelledAppError()
  }
}

export function validateLoadedCourse(course: PersistedCourse): PersistedCourse {
  const validation = validatePersistedCourse(course)
  if (!validation.ok) {
    throw createValidationAppError(
      "Loaded course validation failed.",
      validation.issues,
    )
  }

  return validation.value
}

export async function loadRequiredCourse(
  courseStore: CourseStore,
  courseId: string,
  signal?: AbortSignal,
): Promise<PersistedCourse> {
  throwIfAborted(signal)
  const course = await courseStore.loadCourse(courseId, signal)
  throwIfAborted(signal)

  if (course !== null) {
    return validateLoadedCourse(course)
  }

  throw {
    type: "not-found",
    message: `Course '${courseId}' was not found.`,
    resource: "course",
  } satisfies AppError
}

export async function loadSettingsOrDefault(
  appSettingsStore: AppSettingsStore,
  signal?: AbortSignal,
): Promise<PersistedAppSettings> {
  throwIfAborted(signal)
  const storedSettings = await appSettingsStore.loadSettings(signal)
  throwIfAborted(signal)

  if (storedSettings === null) {
    return defaultAppSettings
  }

  const validation = validatePersistedAppSettings(storedSettings)
  if (!validation.ok) {
    throw createValidationAppError(
      "App settings validation failed.",
      validation.issues,
    )
  }

  return validation.value
}

export function resolveCourseSnapshot(
  course: PersistedCourse,
): PersistedCourse {
  return validateLoadedCourse(course)
}

export function resolveAppSettingsSnapshot(
  appSettings: PersistedAppSettings,
): PersistedAppSettings {
  const validation = validatePersistedAppSettings(appSettings)
  if (!validation.ok) {
    throw createValidationAppError(
      "App settings validation failed.",
      validation.issues,
    )
  }
  return validation.value
}

export function optionalUserAgent(value: string | null | undefined): {
  userAgent?: string
} {
  const normalized = value?.trim()
  if (!normalized) {
    return {}
  }

  return { userAgent: normalized }
}

export function resolveLmsDraft(
  course: PersistedCourse,
  settings: PersistedAppSettings,
): LmsConnectionDraft {
  if (course.lmsConnectionName === null) {
    throw {
      type: "not-found",
      message: "Course does not reference an LMS connection.",
      resource: "connection",
    } satisfies AppError
  }

  const connection = settings.lmsConnections.find(
    (candidate) => candidate.name === course.lmsConnectionName,
  )
  if (connection === undefined) {
    throw {
      type: "not-found",
      message: `LMS connection '${course.lmsConnectionName}' was not found.`,
      resource: "connection",
    } satisfies AppError
  }

  return {
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    token: connection.token,
    ...optionalUserAgent(connection.userAgent),
  }
}

export function resolveGitDraft(
  course: PersistedCourse,
  settings: PersistedAppSettings,
): GitConnectionDraft | null {
  if (course.gitConnectionId === null) {
    return null
  }

  const connection = settings.gitConnections.find(
    (candidate) => candidate.id === course.gitConnectionId,
  )
  if (connection === undefined) {
    throw {
      type: "not-found",
      message: `Git connection '${course.gitConnectionId}' was not found.`,
      resource: "connection",
    } satisfies AppError
  }

  return {
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    token: connection.token,
  }
}

export function normalizeProviderError(
  error: unknown,
  provider:
    | VerifyLmsDraftInput["provider"]
    | VerifyGitDraftInput["provider"]
    | "git",
  operation: string,
): AppError {
  if (isSharedAppError(error)) {
    return error
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }

  return {
    type: "provider",
    message: error instanceof Error ? error.message : String(error),
    provider,
    operation,
    retryable: true,
  }
}

export function normalizeUserFileError(
  error: unknown,
  operation: "read" | "write",
): AppError {
  if (isSharedAppError(error)) {
    return error
  }

  if (error instanceof Error && /not found/i.test(error.message)) {
    return {
      type: "not-found",
      message: error.message,
      resource: "file",
    }
  }

  return {
    type: "persistence",
    message: error instanceof Error ? error.message : String(error),
    operation,
  }
}

export function inferFileFormat(file: UserFileRef): "csv" | "xlsx" | null {
  const loweredName = file.displayName.toLowerCase()
  if (loweredName.endsWith(".csv") || file.mediaType === "text/csv") {
    return "csv"
  }
  if (
    loweredName.endsWith(".xlsx") ||
    file.mediaType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx"
  }
  return null
}

const ROLE_SYNONYMS: Record<string, string> = {
  instructor: "teacher",
  faculty: "teacher",
  teaching_assistant: "ta",
  staff: "teacher",
}

const ENROLLMENT_TYPE_SET = new Set<string>(enrollmentTypeKinds)

function resolveEnrollmentType(role: string | undefined): string | undefined {
  if (role === undefined) return undefined
  const normalized = role.trim().toLowerCase()
  if (normalized === "") return undefined
  if (ENROLLMENT_TYPE_SET.has(normalized)) return normalized
  return ROLE_SYNONYMS[normalized]
}

function toStudentImportRow(row: TabularRow): StudentImportRow {
  return {
    name:
      row.name ??
      row.display_name ??
      row.student_name ??
      row.full_name ??
      row.id ??
      row.student_id ??
      "",
    id: row.id ?? row.student_id,
    email: row.email ?? row.student_email,
    student_number: row.student_number,
    git_username: row.git_username,
    status: row.status,
    role: row.role ?? row.type ?? row.enrollment_type ?? row.member_type,
  }
}

export function parseStudentRows(
  rows: readonly TabularRow[],
): StudentImportRow[] {
  const normalizedRows: StudentImportRow[] = []
  const issues: AppValidationIssue[] = []

  for (const [index, row] of rows.entries()) {
    const candidate = toStudentImportRow(row)
    const parsed = studentImportRowSchema.safeParse(candidate)
    if (parsed.success) {
      normalizedRows.push(parsed.data)
      continue
    }

    for (const issue of parsed.error.issues) {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "row"
      issues.push({
        path: `rows.${index}.${issuePath}`,
        message: issue.message,
      })
    }
  }

  if (issues.length > 0) {
    throw createValidationAppError("Student import rows are invalid.", issues)
  }

  return normalizedRows
}

export function parseGitUsernameRows(
  rows: readonly TabularRow[],
): GitUsernameImportRow[] {
  const normalizedRows: GitUsernameImportRow[] = []
  const issues: AppValidationIssue[] = []

  for (const [index, row] of rows.entries()) {
    const candidate = {
      email: row.email ?? row.student_email ?? "",
      git_username: row.git_username ?? row.username ?? "",
    }
    const parsed = gitUsernameImportRowSchema.safeParse(candidate)
    if (parsed.success) {
      normalizedRows.push(parsed.data)
      continue
    }

    for (const issue of parsed.error.issues) {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "row"
      issues.push({
        path: `rows.${index}.${issuePath}`,
        message: issue.message,
      })
    }
  }

  if (issues.length > 0) {
    throw createValidationAppError(
      "Git username import rows are invalid.",
      issues,
    )
  }

  return normalizedRows
}

function toGroupSetImportRow(row: TabularRow): GroupSetImportRow {
  return {
    group_name: row.group_name ?? row.group ?? row.team ?? "",
    group_id: row.group_id ?? row.id,
    name: row.name ?? row.member_name ?? row.student_name,
    email: row.email ?? row.student_email,
  }
}

export function parseGroupSetImportRows(
  rows: readonly TabularRow[],
): GroupSetImportRow[] {
  const normalizedRows: GroupSetImportRow[] = []
  const issues: AppValidationIssue[] = []

  for (const [index, row] of rows.entries()) {
    const candidate = toGroupSetImportRow(row)
    const parsed = groupSetImportRowSchema.safeParse(candidate)
    if (parsed.success) {
      normalizedRows.push(parsed.data)
      continue
    }

    for (const issue of parsed.error.issues) {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "row"
      issues.push({
        path: `rows.${index}.${issuePath}`,
        message: issue.message,
      })
    }
  }

  if (issues.length > 0) {
    throw createValidationAppError("Group-set import rows are invalid.", issues)
  }

  return normalizedRows
}

function toRosterMemberInput(row: StudentImportRow, index: number) {
  return {
    id: row.id ?? row.student_number ?? row.email ?? `imported-${index + 1}`,
    nameCandidates: [row.name],
    emailCandidates: row.email === undefined ? [] : [row.email],
    studentNumber: row.student_number,
    gitUsername: row.git_username,
    status: row.status,
    enrollmentType: resolveEnrollmentType(row.role),
    source: "import",
  }
}

export function rosterFromStudentRows(rows: readonly StudentImportRow[]) {
  const studentInputs: ReturnType<typeof toRosterMemberInput>[] = []
  const staffInputs: ReturnType<typeof toRosterMemberInput>[] = []

  for (const [index, row] of rows.entries()) {
    const input = toRosterMemberInput(row, index)
    const enrollmentType = resolveEnrollmentType(row.role)
    if (enrollmentType !== undefined && enrollmentType !== "student") {
      staffInputs.push(input)
    } else {
      studentInputs.push(input)
    }
  }

  const roster = normalizeRoster(studentInputs, staffInputs)
  ensureSystemGroupSets(roster)
  return roster
}

export function normalizeRepositoryExecutionError(
  error: unknown,
  operation: string,
): AppError {
  if (isSharedAppError(error)) {
    return error
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }

  return {
    type: "provider",
    message: error instanceof Error ? error.message : String(error),
    provider: "git",
    operation,
    retryable: true,
  }
}

export type VerifyGitUsernamesOnlyClient = Pick<
  GitProviderClient,
  "verifyGitUsernames"
>

export type ReadWriteUserFilePort = {
  readText(reference: UserFileRef, signal?: AbortSignal): Promise<UserFileText>
  writeText(
    reference: UserFileRef,
    text: string,
    signal?: AbortSignal,
  ): Promise<{
    displayName: string
    mediaType: string
    byteLength: number
    savedAt: string
  }>
}
