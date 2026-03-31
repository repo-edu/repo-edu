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
import { allocateMemberId } from "@repo-edu/domain/id-allocator"
import {
  normalizeEmail,
  normalizeMissingEmailStatus,
  normalizeOptionalString,
} from "@repo-edu/domain/roster"
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
  memberStatusKinds,
  type EnrollmentType,
  type GroupSetImportFormat,
  type GroupSetImportRow,
  type IdSequences,
  type MemberStatus,
  type PersistedAppSettings,
  type PersistedCourse,
  type Roster,
  type RosterMember,
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

export function inferGroupSetImportFormat(
  file: UserFileRef,
): GroupSetImportFormat | null {
  const loweredName = file.displayName.toLowerCase()
  if (loweredName.endsWith(".csv") || file.mediaType === "text/csv") {
    return "group-set-csv"
  }
  if (loweredName.endsWith(".txt") || file.mediaType === "text/plain") {
    return "repobee-students"
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
const MEMBER_STATUS_SET = new Set<string>(memberStatusKinds)

function resolveEnrollmentType(
  role: string | undefined,
): EnrollmentType | undefined {
  if (role === undefined) return undefined
  const normalized = role.trim().toLowerCase()
  if (normalized === "") return undefined
  if (ENROLLMENT_TYPE_SET.has(normalized)) {
    return normalized as EnrollmentType
  }
  const synonym = ROLE_SYNONYMS[normalized]
  if (synonym === undefined) {
    return undefined
  }
  return synonym as EnrollmentType
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
    name: row.name ?? row.member_name ?? row.student_name,
    email: row.email ?? row.student_email,
    git_username: row.git_username ?? row.username,
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

type StudentImportPatch = {
  name: string
  email?: string
  studentNumber?: string | null
  gitUsername?: string | null
  status?: MemberStatus
  enrollmentType?: EnrollmentType
}

function normalizeMemberStatus(
  value: string | undefined,
): MemberStatus | undefined {
  const normalized = normalizeOptionalString(value)?.toLowerCase()
  if (!normalized || !MEMBER_STATUS_SET.has(normalized)) {
    return undefined
  }
  return normalized as MemberStatus
}

function toStudentImportPatch(row: StudentImportRow): StudentImportPatch {
  return {
    name: row.name.trim(),
    email: row.email === undefined ? undefined : row.email.trim(),
    studentNumber:
      row.student_number === undefined
        ? undefined
        : normalizeOptionalString(row.student_number),
    gitUsername:
      row.git_username === undefined
        ? undefined
        : normalizeOptionalString(row.git_username),
    status: normalizeMemberStatus(row.status),
    enrollmentType: resolveEnrollmentType(row.role),
  }
}

function upsertMemberIndex(
  index: Map<string, string | null>,
  key: string,
  memberId: string,
) {
  const existing = index.get(key)
  if (existing === undefined) {
    index.set(key, memberId)
    return
  }
  if (existing !== memberId) {
    index.set(key, null)
  }
}

function buildRosterEmailIndex(
  members: readonly RosterMember[],
): Map<string, string | null> {
  const index = new Map<string, string | null>()
  for (const member of members) {
    const key = normalizeEmail(member.email)
    if (key.length === 0) {
      continue
    }
    upsertMemberIndex(index, key, member.id)
  }
  return index
}

function buildRosterStudentNumberIndex(
  members: readonly RosterMember[],
): Map<string, string | null> {
  const index = new Map<string, string | null>()
  for (const member of members) {
    const key = normalizeOptionalString(member.studentNumber)
    if (key === null) {
      continue
    }
    upsertMemberIndex(index, key, member.id)
  }
  return index
}

function applyStudentImportPatch(
  member: RosterMember,
  patch: StudentImportPatch,
): RosterMember {
  const nextEmail = patch.email === undefined ? member.email : patch.email
  const nextStatus = normalizeMissingEmailStatus(
    nextEmail,
    patch.status ?? member.status,
  )
  const nextEnrollmentType = patch.enrollmentType ?? member.enrollmentType
  const nextGitUsername =
    patch.gitUsername === undefined ? member.gitUsername : patch.gitUsername

  return {
    ...member,
    name: patch.name,
    email: nextEmail,
    studentNumber:
      patch.studentNumber === undefined
        ? member.studentNumber
        : patch.studentNumber,
    gitUsername: nextGitUsername,
    gitUsernameStatus:
      patch.gitUsername === undefined ? member.gitUsernameStatus : "unknown",
    status: nextStatus,
    enrollmentType: nextEnrollmentType,
    enrollmentDisplay: member.enrollmentDisplay,
    source: "import",
  }
}

function createImportedMember(
  id: string,
  patch: StudentImportPatch,
): RosterMember {
  const email = patch.email ?? ""
  return {
    id,
    name: patch.name,
    email,
    studentNumber: patch.studentNumber ?? null,
    gitUsername: patch.gitUsername ?? null,
    gitUsernameStatus: "unknown",
    status: normalizeMissingEmailStatus(email, patch.status ?? "active"),
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: patch.enrollmentType ?? "student",
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "import",
  }
}

function matchExistingMemberId(
  patch: StudentImportPatch,
  emailIndex: ReadonlyMap<string, string | null>,
  studentNumberIndex: ReadonlyMap<string, string | null>,
): string | null {
  if (patch.email !== undefined) {
    const byEmail = emailIndex.get(normalizeEmail(patch.email))
    if (byEmail !== undefined && byEmail !== null) {
      return byEmail
    }
  }

  if (patch.studentNumber !== undefined && patch.studentNumber !== null) {
    const byStudentNumber = studentNumberIndex.get(patch.studentNumber)
    if (byStudentNumber !== undefined && byStudentNumber !== null) {
      return byStudentNumber
    }
  }

  return null
}

export function upsertRosterFromStudentRows(
  roster: Roster,
  rows: readonly StudentImportRow[],
  sequences: IdSequences,
): { roster: Roster; idSequences: IdSequences } {
  const membersById = new Map(
    roster.students.concat(roster.staff).map((member) => [member.id, member]),
  )
  let emailIndex = buildRosterEmailIndex([...membersById.values()])
  let studentNumberIndex = buildRosterStudentNumberIndex([
    ...membersById.values(),
  ])
  let seq = sequences

  for (const row of rows) {
    const patch = toStudentImportPatch(row)
    const matchedMemberId = matchExistingMemberId(
      patch,
      emailIndex,
      studentNumberIndex,
    )

    if (matchedMemberId !== null) {
      const existing = membersById.get(matchedMemberId)
      if (existing !== undefined) {
        membersById.set(
          matchedMemberId,
          applyStudentImportPatch(existing, patch),
        )
      }
    } else {
      const alloc = allocateMemberId(seq)
      seq = alloc.sequences
      membersById.set(alloc.id, createImportedMember(alloc.id, patch))
    }

    const allMembers = [...membersById.values()]
    emailIndex = buildRosterEmailIndex(allMembers)
    studentNumberIndex = buildRosterStudentNumberIndex(allMembers)
  }

  const students: RosterMember[] = []
  const staff: RosterMember[] = []
  for (const member of membersById.values()) {
    if (member.enrollmentType === "student") {
      students.push(member)
    } else {
      staff.push(member)
    }
  }

  return {
    roster: {
      ...roster,
      students,
      staff,
    },
    idSequences: seq,
  }
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
