import type {
  AppError,
  LmsCourseSummary as AppLmsCourseSummary,
  AppValidationIssue,
  AssignmentValidationInput,
  ConnectionVerificationResult,
  DiagnosticOutput,
  GitUsernameImportInput,
  GroupSetConnectFromLmsInput,
  GroupSetExportInput,
  GroupSetFetchAvailableFromLmsInput,
  GroupSetPreviewImportFromFileInput,
  GroupSetPreviewReimportFromFileInput,
  GroupSetSyncFromLmsInput,
  ListLmsCoursesDraftInput,
  MilestoneProgress,
  RepositoryBatchInput,
  RepositoryBatchResult,
  RosterExportMembersInput,
  RosterImportFromFileInput,
  RosterImportFromLmsInput,
  RosterValidationInput,
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowResult,
  SpikeWorkflowOutput,
  SpikeWorkflowProgress,
  SpikeWorkflowResult,
  UserFileExportPreviewResult,
  UserFileInspectResult,
  UserFileRef,
  UserSaveTargetRef,
  VerifyGitDraftInput,
  VerifyLmsDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  packageId as contractPackageId,
  createCancelledAppError,
  isAppError,
} from "@repo-edu/application-contract"
import type {
  CourseSummary,
  GitIdentityMode,
  GitUsernameImportRow,
  GroupSetImportRow,
  PersistedAppSettings,
  PersistedCourse,
  PlannedRepositoryGroup,
  RepoTeam,
  RosterValidationResult,
  StudentImportRow,
  ValidationResult,
} from "@repo-edu/domain"
import {
  defaultAppSettings,
  packageId as domainPackageId,
  enrollmentTypeKinds,
  ensureSystemGroupSets,
  exportGroupSetRows,
  exportRepoTeams,
  formatSmokeWorkflowMessage,
  gitUsernameImportRowSchema,
  groupSetExportHeaders,
  groupSetImportRowSchema,
  mergeRosterFromLmsWithConflicts,
  normalizeRoster,
  ORIGIN_LMS,
  planRepositoryOperation,
  previewImportGroupSet,
  previewReimportGroupSet,
  studentImportRowSchema,
  validateAssignment,
  validateAssignmentWithTemplate,
  validatePersistedAppSettings,
  validatePersistedCourse,
  validateRoster,
} from "@repo-edu/domain"
import type {
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  ProcessResult,
  UserFilePort,
  UserFileText,
} from "@repo-edu/host-runtime-contract"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  GitProviderClient,
  GitUsernameStatus as GitProviderUsernameStatus,
} from "@repo-edu/integrations-git-contract"
import { packageId as gitContractPackageId } from "@repo-edu/integrations-git-contract"
import type {
  LmsClient,
  LmsConnectionDraft,
  LmsFetchedGroupSet,
} from "@repo-edu/integrations-lms-contract"
import { packageId as lmsContractPackageId } from "@repo-edu/integrations-lms-contract"
import { parseCsv, serializeCsv } from "./adapters/tabular/index.js"
import type { TabularRow } from "./adapters/tabular/types.js"

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

function summarizeCourse(course: PersistedCourse): CourseSummary {
  return {
    id: course.id,
    displayName: course.displayName,
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

function validateLoadedCourse(course: PersistedCourse): PersistedCourse {
  const validation = validatePersistedCourse(course)
  if (!validation.ok) {
    throw createValidationAppError(
      "Loaded course validation failed.",
      validation.issues,
    )
  }

  return validation.value
}

async function loadRequiredCourse(
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

async function loadSettingsOrDefault(
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

function resolveCourseSnapshot(course: PersistedCourse): PersistedCourse {
  return validateLoadedCourse(course)
}

function resolveAppSettingsSnapshot(
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

export function createValidationWorkflowHandlers(): Pick<
  WorkflowHandlerMap<"validation.roster" | "validation.assignment">,
  "validation.roster" | "validation.assignment"
> {
  return {
    "validation.roster": async (
      input: RosterValidationInput,
      options?: WorkflowCallOptions<never, never>,
    ) => {
      throwIfAborted(options?.signal)
      const course = resolveCourseSnapshot(input.course)
      return runValidateRosterForCourse(course)
    },
    "validation.assignment": async (
      input: AssignmentValidationInput,
      options?: WorkflowCallOptions<never, never>,
    ) => {
      throwIfAborted(options?.signal)
      const course = resolveCourseSnapshot(input.course)
      return runValidateAssignmentForCourse(course, input.assignmentId)
    },
  }
}

export function createSettingsWorkflowHandlers(
  appSettingsStore: AppSettingsStore,
): Pick<
  WorkflowHandlerMap<"settings.loadApp" | "settings.saveApp">,
  "settings.loadApp" | "settings.saveApp"
> {
  return {
    "settings.loadApp": async (
      _input,
      options?: WorkflowCallOptions<never, never>,
    ) => loadSettingsOrDefault(appSettingsStore, options?.signal),
    "settings.saveApp": async (
      input: PersistedAppSettings,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating app settings payload.",
      })

      const validation = validatePersistedAppSettings(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "App settings validation failed.",
          validation.issues,
        )
      }

      options?.onOutput?.({
        channel: "info",
        message: "Writing app settings to store.",
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing app settings to store.",
      })

      const savedSettings = await appSettingsStore.saveSettings(
        validation.value,
        options?.signal,
      )
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "App settings saved.",
      })

      return savedSettings
    },
  }
}

export type ConnectionVerificationPorts = {
  lms: Pick<LmsClient, "verifyConnection" | "listCourses">
  git: Pick<GitProviderClient, "verifyConnection">
}

function normalizeProviderError(
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

export function createConnectionWorkflowHandlers(
  ports: ConnectionVerificationPorts,
): Pick<
  WorkflowHandlerMap<
    | "connection.verifyLmsDraft"
    | "connection.listLmsCoursesDraft"
    | "connection.verifyGitDraft"
  >,
  | "connection.verifyLmsDraft"
  | "connection.listLmsCoursesDraft"
  | "connection.verifyGitDraft"
> {
  return {
    "connection.verifyLmsDraft": async (
      input: VerifyLmsDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ConnectionVerificationResult> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LMS connection verification request.",
        })

        const draft: LmsConnectionDraft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
          ...optionalUserAgent(input.userAgent),
        }

        options?.onOutput?.({
          channel: "info",
          message: `Verifying ${input.provider} LMS connection.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Verifying LMS credentials with provider.",
        })

        const result = await ports.lms.verifyConnection(draft, options?.signal)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LMS connection verification complete.",
        })

        return {
          verified: result.verified,
          checkedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw normalizeProviderError(error, input.provider, "verifyConnection")
      }
    },
    "connection.listLmsCoursesDraft": async (
      input: ListLmsCoursesDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<AppLmsCourseSummary[]> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LMS course list request.",
        })

        const draft: LmsConnectionDraft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
          ...optionalUserAgent(input.userAgent),
        }

        options?.onOutput?.({
          channel: "info",
          message: `Fetching available courses from ${input.provider}.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching courses from LMS provider.",
        })

        const courses = await ports.lms.listCourses(draft, options?.signal)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LMS course list loaded.",
        })

        return courses
      } catch (error) {
        throw normalizeProviderError(error, input.provider, "listCourses")
      }
    },
    "connection.verifyGitDraft": async (
      input: VerifyGitDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ConnectionVerificationResult> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing Git connection verification request.",
        })

        const draft: GitConnectionDraft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
        }

        options?.onOutput?.({
          channel: "info",
          message: `Verifying ${input.provider} Git connection.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Verifying Git credentials with provider.",
        })

        const result = await ports.git.verifyConnection(draft, options?.signal)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Git connection verification complete.",
        })

        return {
          verified: result.verified,
          checkedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw normalizeProviderError(error, input.provider, "verifyConnection")
      }
    },
  }
}

export type RosterWorkflowPorts = {
  lms: Pick<LmsClient, "fetchRoster">
  userFile: UserFilePort
}

const memberExportHeaders = [
  "id",
  "name",
  "email",
  "student_number",
  "git_username",
  "status",
  "enrollment_type",
] as const

function inferFileFormat(file: UserFileRef): "csv" | "xlsx" | null {
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

function parseStudentRows(rows: readonly TabularRow[]): StudentImportRow[] {
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

function parseGitUsernameRows(
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

function parseGroupSetImportRows(
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

function rosterFromStudentRows(rows: readonly StudentImportRow[]) {
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

function resolveLmsDraft(
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

function optionalUserAgent(value: string | null | undefined): {
  userAgent?: string
} {
  const normalized = value?.trim()
  if (!normalized) {
    return {}
  }

  return { userAgent: normalized }
}

function resolveGitDraft(
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

export function createRosterWorkflowHandlers(
  ports: RosterWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    "roster.importFromFile" | "roster.importFromLms" | "roster.exportMembers"
  >,
  "roster.importFromFile" | "roster.importFromLms" | "roster.exportMembers"
> {
  return {
    "roster.importFromFile": async (
      input: RosterImportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading roster import file.",
      })
      const fileText = await ports.userFile.readText(
        input.file,
        options?.signal,
      )

      const format = inferFileFormat(input.file)
      if (format !== "csv") {
        throw createValidationAppError(
          "Roster import file format is unsupported.",
          [
            {
              path: "file.format",
              message:
                "Only CSV roster import is supported by the current text-based file port.",
            },
          ],
        )
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Parsing student rows from CSV.",
      })
      const parsed = parseCsv(fileText.text)
      const rows = parseStudentRows(parsed.rows)
      const roster = rosterFromStudentRows(rows)
      roster.connection = {
        kind: "import",
        sourceFilename: fileText.displayName,
        lastUpdated: new Date().toISOString(),
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Roster import complete.",
      })
      options?.onOutput?.({
        channel: "info",
        message: `Imported ${roster.students.length} students from ${fileText.displayName}.`,
      })
      return roster
    },
    "roster.importFromLms": async (
      input: RosterImportFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 4
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)

        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching roster from LMS provider.",
        })
        options?.onOutput?.({
          channel: "info",
          message: `Fetching roster from ${draft.provider} course ${input.lmsCourseId}.`,
        })
        const fetchedRoster = await ports.lms.fetchRoster(
          draft,
          input.lmsCourseId,
          options?.signal,
          (message) => {
            options?.onProgress?.({
              step: 2,
              totalSteps,
              label: message,
            })
          },
        )

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Merging roster members.",
        })
        const result = mergeRosterFromLmsWithConflicts(
          course.roster,
          fetchedRoster,
        )
        ensureSystemGroupSets(result.roster)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "LMS roster import complete.",
        })
        return result
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchRoster")
      }
    },
    "roster.exportMembers": async (
      input: RosterExportMembersInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for roster export.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      if (input.format !== "csv") {
        throw createValidationAppError("Roster export format is unsupported.", [
          {
            path: "format",
            message:
              "Only CSV export is supported by the current text-based file port.",
          },
        ])
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Serializing roster export payload.",
      })
      const allMembers = [...course.roster.students, ...course.roster.staff]
      const exportRows = allMembers.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        student_number: member.studentNumber ?? "",
        git_username: member.gitUsername ?? "",
        status: member.status,
        enrollment_type: member.enrollmentType,
      }))
      const text = serializeCsv({
        headers: [...memberExportHeaders],
        rows: exportRows,
      })
      await ports.userFile.writeText(input.target, text, options?.signal)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Roster export written.",
      })
      options?.onOutput?.({
        channel: "info",
        message: `Exported ${exportRows.length} members to ${input.target.displayName}.`,
      })

      return { file: input.target }
    },
  }
}

export type GroupSetWorkflowPorts = {
  lms: Pick<LmsClient, "listGroupSets" | "fetchGroupSet">
  userFile: UserFilePort
}

function lmsGroupSetRemoteId(
  groupSetId: string,
  course: PersistedCourse,
): string {
  const groupSet = course.roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    throw {
      type: "not-found",
      message: `Group set '${groupSetId}' was not found.`,
      resource: "group-set",
    } satisfies AppError
  }

  const connection = groupSet.connection
  if (connection?.kind === "canvas") {
    return connection.groupSetId
  }
  if (connection?.kind === "moodle") {
    return connection.groupingId
  }

  throw createValidationAppError("Group set is not LMS-connected.", [
    {
      path: "groupSet.connection",
      message: "The selected group set must be connected to Canvas or Moodle.",
    },
  ])
}

function generateLocalGroupSetId(course: PersistedCourse): string {
  const existingIds = new Set(
    course.roster.groupSets.map((groupSet) => groupSet.id),
  )
  while (true) {
    const randomPart =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const candidate = `group_set_${randomPart}`
    if (!existingIds.has(candidate)) {
      return candidate
    }
  }
}

function createConnectedGroupSet(
  provider: VerifyLmsDraftInput["provider"],
  courseId: string,
  remoteGroupSetId: string,
  localGroupSetId: string,
): PersistedCourse["roster"]["groupSets"][number] {
  const connection =
    provider === "canvas"
      ? ({
          kind: "canvas",
          courseId,
          groupSetId: remoteGroupSetId,
          lastUpdated: new Date().toISOString(),
        } as const)
      : ({
          kind: "moodle",
          courseId,
          groupingId: remoteGroupSetId,
          lastUpdated: new Date().toISOString(),
        } as const)

  return {
    id: localGroupSetId,
    name: `Group Set ${remoteGroupSetId}`,
    groupIds: [],
    connection,
    groupSelection: {
      kind: "all",
      excludedGroupIds: [],
    },
    repoNameTemplate: null,
  }
}

function connectedRemoteId(
  connection: PersistedCourse["roster"]["groupSets"][number]["connection"],
): string | null {
  if (connection?.kind === "canvas") {
    return connection.groupSetId
  }
  if (connection?.kind === "moodle") {
    return connection.groupingId
  }
  return null
}

function applyFetchedGroupSetToCourse(
  course: PersistedCourse,
  localGroupSetId: string,
  fetched: LmsFetchedGroupSet,
): {
  nextCourse: PersistedCourse
  nextGroupSet: PersistedCourse["roster"]["groupSets"][number]
} {
  const currentGroupSet = course.roster.groupSets.find(
    (candidate) => candidate.id === localGroupSetId,
  )
  if (currentGroupSet === undefined) {
    throw {
      type: "not-found",
      message: `Group set '${localGroupSetId}' was not found.`,
      resource: "group-set",
    } satisfies AppError
  }

  const currentSetGroupIds = new Set(currentGroupSet.groupIds)
  const existingByLmsGroupId = new Map<
    string,
    (typeof course.roster.groups)[number]
  >()
  for (const group of course.roster.groups) {
    if (!currentSetGroupIds.has(group.id) || group.lmsGroupId === null) {
      continue
    }
    existingByLmsGroupId.set(group.lmsGroupId, group)
  }

  const memberMap = buildLmsMemberMap(course)
  const syncedGroups = fetched.groups.map((group) => {
    const lmsGroupId = group.lmsGroupId ?? group.id
    const existing = existingByLmsGroupId.get(lmsGroupId)
    return {
      id: existing?.id ?? group.id,
      name: group.name,
      memberIds: resolveLmsGroupMembers(memberMap, group.memberIds),
      origin: ORIGIN_LMS,
      lmsGroupId,
    }
  })
  const syncedIds = new Set(syncedGroups.map((group) => group.id))
  const removedGroupIds = currentGroupSet.groupIds.filter(
    (groupId) => !syncedIds.has(groupId),
  )

  const groupsById = new Map(
    course.roster.groups.map((group) => [group.id, group]),
  )
  for (const removedId of removedGroupIds) {
    groupsById.delete(removedId)
  }
  for (const group of syncedGroups) {
    groupsById.set(group.id, group)
  }

  const nextGroupSet = {
    ...currentGroupSet,
    name: fetched.groupSet.name,
    groupIds: syncedGroups.map((group) => group.id),
    connection: fetched.groupSet.connection ?? currentGroupSet.connection,
    groupSelection: currentGroupSet.groupSelection,
  }

  const removedIdSet = new Set(removedGroupIds)
  const nextGroupSets = course.roster.groupSets.map((groupSet) => {
    if (groupSet.id === currentGroupSet.id) {
      return nextGroupSet
    }
    return {
      ...groupSet,
      groupIds: groupSet.groupIds.filter(
        (groupId) => !removedIdSet.has(groupId),
      ),
    }
  })

  return {
    nextGroupSet,
    nextCourse: {
      ...course,
      roster: {
        ...course.roster,
        groups: [...groupsById.values()],
        groupSets: nextGroupSets,
      },
      updatedAt: new Date().toISOString(),
    },
  }
}

function buildLmsMemberMap(course: PersistedCourse): Map<string, string> {
  const map = new Map<string, string>()
  for (const member of course.roster.students.concat(course.roster.staff)) {
    map.set(member.id, member.id)
    if (member.lmsUserId !== null && member.lmsUserId !== "") {
      map.set(member.lmsUserId, member.id)
    }
  }
  return map
}

function resolveLmsGroupMembers(
  memberMap: ReadonlyMap<string, string>,
  memberIds: readonly string[],
): string[] {
  const resolved: string[] = []
  const seen = new Set<string>()
  for (const memberId of memberIds) {
    const rosterMemberId = memberMap.get(memberId)
    if (rosterMemberId === undefined || seen.has(rosterMemberId)) {
      continue
    }
    seen.add(rosterMemberId)
    resolved.push(rosterMemberId)
  }
  return resolved
}

function serializeRepobeeYaml(teams: readonly RepoTeam[]): string {
  return teams
    .map((team) => `${team.name}:\n\tmembers:[${team.members.join(", ")}]`)
    .join("\n")
}

export function createGroupSetWorkflowHandlers(
  ports: GroupSetWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    | "groupSet.fetchAvailableFromLms"
    | "groupSet.connectFromLms"
    | "groupSet.syncFromLms"
    | "groupSet.previewImportFromFile"
    | "groupSet.previewReimportFromFile"
    | "groupSet.export"
  >,
  | "groupSet.fetchAvailableFromLms"
  | "groupSet.connectFromLms"
  | "groupSet.syncFromLms"
  | "groupSet.previewImportFromFile"
  | "groupSet.previewReimportFromFile"
  | "groupSet.export"
> {
  return {
    "groupSet.fetchAvailableFromLms": async (
      input: GroupSetFetchAvailableFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        if (course.lmsCourseId === null) {
          throw {
            type: "not-found",
            message: "Course does not have a selected LMS course ID.",
            resource: "course",
          } satisfies AppError
        }

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching available LMS group sets.",
        })
        const available = await ports.lms.listGroupSets(
          draft,
          course.lmsCourseId,
          options?.signal,
        )

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LMS group-set discovery complete.",
        })
        return available
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "listGroupSets")
      }
    },
    "groupSet.connectFromLms": async (
      input: GroupSetConnectFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 5
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        if (course.lmsCourseId === null) {
          throw {
            type: "not-found",
            message: "Course does not have a selected LMS course ID.",
            resource: "course",
          } satisfies AppError
        }

        const alreadyConnected = course.roster.groupSets.find(
          (groupSet) =>
            connectedRemoteId(groupSet.connection) === input.remoteGroupSetId,
        )
        if (alreadyConnected !== undefined) {
          throw createValidationAppError(
            "LMS group set is already connected.",
            [
              {
                path: "remoteGroupSetId",
                message: `LMS group set '${input.remoteGroupSetId}' is already connected as '${alreadyConnected.name}'.`,
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Creating connected local group set.",
        })
        const localGroupSetId = generateLocalGroupSetId(course)
        const courseWithConnectedSet: PersistedCourse = {
          ...course,
          roster: {
            ...course.roster,
            groupSets: [
              ...course.roster.groupSets,
              createConnectedGroupSet(
                draft.provider,
                course.lmsCourseId,
                input.remoteGroupSetId,
                localGroupSetId,
              ),
            ],
          },
          updatedAt: new Date().toISOString(),
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Fetching LMS group set data.",
        })
        const fetched = await ports.lms.fetchGroupSet(
          draft,
          course.lmsCourseId,
          input.remoteGroupSetId,
          options?.signal,
          (message) => {
            options?.onProgress?.({
              step: 3,
              totalSteps,
              label: message,
            })
          },
        )

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Applying LMS group-set patch to roster.",
        })
        const { nextCourse, nextGroupSet } = applyFetchedGroupSetToCourse(
          courseWithConnectedSet,
          localGroupSetId,
          fetched,
        )

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "LMS group-set connection complete.",
        })
        return { ...nextGroupSet, roster: nextCourse.roster }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchGroupSet")
      }
    },
    "groupSet.syncFromLms": async (
      input: GroupSetSyncFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 4
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        if (course.lmsCourseId === null) {
          throw {
            type: "not-found",
            message: "Course does not have a selected LMS course ID.",
            resource: "course",
          } satisfies AppError
        }

        const remoteGroupSetId = lmsGroupSetRemoteId(input.groupSetId, course)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching LMS group set data.",
        })
        const fetched = await ports.lms.fetchGroupSet(
          draft,
          course.lmsCourseId,
          remoteGroupSetId,
          options?.signal,
          (message) => {
            options?.onProgress?.({
              step: 2,
              totalSteps,
              label: message,
            })
          },
        )

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Applying LMS group-set patch to roster.",
        })
        const { nextCourse, nextGroupSet } = applyFetchedGroupSetToCourse(
          course,
          input.groupSetId,
          fetched,
        )

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "LMS group-set sync complete.",
        })
        return { ...nextGroupSet, roster: nextCourse.roster }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchGroupSet")
      }
    },
    "groupSet.previewImportFromFile": async (
      input: GroupSetPreviewImportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for group-set import preview.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set import file.",
      })
      let fileText: UserFileText
      try {
        fileText = await ports.userFile.readText(input.file, options?.signal)
      } catch (error) {
        throw normalizeUserFileError(error, "read")
      }
      const format = inferFileFormat(input.file)
      if (format !== "csv") {
        throw createValidationAppError(
          "Group-set preview format is unsupported.",
          [
            {
              path: "file.format",
              message:
                "Only CSV group-set preview is supported by the current text-based file port.",
            },
          ],
        )
      }
      const parsedRows = parseGroupSetImportRows(parseCsv(fileText.text).rows)
      const preview = previewImportGroupSet(course.roster, parsedRows)
      if (!preview.ok) {
        throw createValidationAppError(
          "Group-set import preview failed.",
          preview.issues,
        )
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set import preview complete.",
      })
      return preview.value
    },
    "groupSet.previewReimportFromFile": async (
      input: GroupSetPreviewReimportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for group-set reimport preview.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set reimport file.",
      })
      let fileText: UserFileText
      try {
        fileText = await ports.userFile.readText(input.file, options?.signal)
      } catch (error) {
        throw normalizeUserFileError(error, "read")
      }
      const format = inferFileFormat(input.file)
      if (format !== "csv") {
        throw createValidationAppError(
          "Group-set reimport preview format is unsupported.",
          [
            {
              path: "file.format",
              message:
                "Only CSV group-set reimport preview is supported by the current text-based file port.",
            },
          ],
        )
      }
      const parsedRows = parseGroupSetImportRows(parseCsv(fileText.text).rows)
      const preview = previewReimportGroupSet(
        course.roster,
        input.groupSetId,
        parsedRows,
      )
      if (!preview.ok) {
        throw createValidationAppError(
          "Group-set reimport preview failed.",
          preview.issues,
        )
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set reimport preview complete.",
      })
      return preview.value
    },
    "groupSet.export": async (
      input: GroupSetExportInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot and group set for export.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      const exportedRows = exportGroupSetRows(course.roster, input.groupSetId)
      if (!exportedRows.ok) {
        throw createValidationAppError(
          "Group-set export preparation failed.",
          exportedRows.issues,
        )
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Serializing group-set export payload.",
      })
      let serialized = ""
      switch (input.format) {
        case "csv":
          serialized = serializeCsv({
            headers: [...groupSetExportHeaders],
            rows: exportedRows.value,
          })
          break
        case "yaml": {
          const teams = exportRepoTeams(course.roster, input.groupSetId)
          if (!teams.ok) {
            throw createValidationAppError(
              "Repobee YAML export preparation failed.",
              teams.issues,
            )
          }
          serialized = serializeRepobeeYaml(teams.value)
          break
        }
        case "xlsx":
          throw createValidationAppError(
            "Group-set export format is unsupported.",
            [
              {
                path: "format",
                message:
                  "XLSX group-set export is unsupported with the current text-based file port.",
              },
            ],
          )
      }

      await ports.userFile.writeText(input.target, serialized, options?.signal)
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set export written.",
      })

      return { file: input.target }
    },
  }
}

export type GitUsernameWorkflowPorts = {
  userFile: UserFilePort
  git: Pick<GitProviderClient, "verifyGitUsernames">
}

function normalizeImportedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createGitUsernameWorkflowHandlers(
  ports: GitUsernameWorkflowPorts,
): Pick<WorkflowHandlerMap<"gitUsernames.import">, "gitUsernames.import"> {
  return {
    "gitUsernames.import": async (
      input: GitUsernameImportInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 5
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        const course = resolveCourseSnapshot(input.course)
        throwIfAborted(options?.signal)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Reading Git username import file.",
        })
        const fileText = await ports.userFile.readText(
          input.file,
          options?.signal,
        )
        const format = inferFileFormat(input.file)
        if (format !== "csv") {
          throw createValidationAppError(
            "Git username import file format is unsupported.",
            [
              {
                path: "file.format",
                message:
                  "Only CSV Git username import is supported by the current text-based file port.",
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Parsing and applying Git username rows.",
        })
        const parsed = parseCsv(fileText.text)
        const rows = parseGitUsernameRows(parsed.rows)
        const roster = {
          ...course.roster,
          students: course.roster.students.map((student) => ({ ...student })),
          staff: course.roster.staff.map((member) => ({ ...member })),
        }
        const studentIndexByEmail = new Map<string, number>()
        for (const [index, student] of roster.students.entries()) {
          studentIndexByEmail.set(normalizeImportedEmail(student.email), index)
        }

        let matched = 0
        let unmatched = 0
        for (const row of rows) {
          const memberIndex = studentIndexByEmail.get(
            normalizeImportedEmail(row.email),
          )
          if (memberIndex === undefined) {
            unmatched += 1
            continue
          }

          const member = roster.students[memberIndex]
          if (member.gitUsername !== row.git_username) {
            member.gitUsername = row.git_username
            member.gitUsernameStatus = "unknown"
          }
          matched += 1
        }

        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft !== null) {
          providerForError = gitDraft.provider
          options?.onProgress?.({
            step: 4,
            totalSteps,
            label: "Verifying imported Git usernames with provider.",
          })

          const usernames = Array.from(
            new Set(
              roster.students
                .map((member) => member.gitUsername?.trim() ?? "")
                .filter((username) => username.length > 0),
            ),
          )
          const verificationResults = await ports.git.verifyGitUsernames(
            gitDraft,
            usernames,
            options?.signal,
          )
          const verificationByUsername = new Map<
            string,
            GitProviderUsernameStatus
          >(verificationResults.map((result) => [result.username, result]))

          for (const member of roster.students) {
            const username = member.gitUsername?.trim() ?? ""
            if (username.length === 0) {
              continue
            }
            const status = verificationByUsername.get(username)
            if (status === undefined) {
              member.gitUsernameStatus = "unknown"
              continue
            }
            member.gitUsernameStatus = status.exists ? "valid" : "invalid"
          }
        } else {
          options?.onProgress?.({
            step: 4,
            totalSteps,
            label:
              "Skipping provider verification (no Git connection configured).",
          })
        }

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Git username import complete.",
        })
        options?.onOutput?.({
          channel: "info",
          message: `Imported ${matched} Git usernames (${unmatched} unmatched emails).`,
        })
        return roster
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "verifyGitUsernames",
        )
      }
    },
  }
}

export type RepositoryWorkflowPorts = {
  git: Pick<
    GitProviderClient,
    "createRepositories" | "resolveRepositoryCloneUrls"
  >
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}

function collectRepositoryGroups(
  course: PersistedCourse,
  assignmentId: string | null,
  groupIds?: readonly string[],
): ValidationResult<PlannedRepositoryGroup[]> {
  const assignmentIds =
    assignmentId === null
      ? course.roster.assignments.map((assignment) => assignment.id)
      : [assignmentId]
  const selectedGroupIds = groupIds ? new Set(groupIds) : null

  const plannedGroups: PlannedRepositoryGroup[] = []
  for (const selectedAssignmentId of assignmentIds) {
    const plan = planRepositoryOperation(course.roster, selectedAssignmentId)
    if (!plan.ok) {
      return plan
    }
    const groups =
      selectedGroupIds === null
        ? plan.value.groups
        : plan.value.groups.filter((group) =>
            selectedGroupIds.has(group.groupId),
          )
    plannedGroups.push(...groups)
  }

  return {
    ok: true,
    value: plannedGroups,
  }
}

function uniqueRepositoryNames(
  groups: readonly PlannedRepositoryGroup[],
): string[] {
  return Array.from(new Set(groups.map((group) => group.repoName)))
}

type RepositoryDirectoryLayout = "flat" | "by-team" | "by-task"

function normalizeDirectoryLayout(
  value: RepositoryBatchInput["directoryLayout"],
): RepositoryDirectoryLayout {
  if (value === "by-team" || value === "by-task") {
    return value
  }
  return "flat"
}

function normalizeTargetDirectory(value: string | undefined): string {
  const normalized = value?.trim()
  return normalized === undefined || normalized === "" ? "." : normalized
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    return "unnamed"
  }
  return trimmed.replace(/[\\/]/g, "_")
}

function joinPath(base: string, segment: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  const normalizedBase = base.replace(/[\\/]+$/g, "")
  const normalizedSegment = segment.replace(/^[\\/]+/g, "")
  if (normalizedBase === "") {
    return normalizedSegment
  }
  return `${normalizedBase}${separator}${normalizedSegment}`
}

function repositoryCloneParentPath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  if (layout === "flat") {
    return targetDirectory
  }

  const folderName =
    layout === "by-team"
      ? sanitizePathSegment(group.groupName)
      : sanitizePathSegment(group.assignmentName)
  return joinPath(targetDirectory, folderName)
}

function repositoryClonePath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  return joinPath(
    repositoryCloneParentPath(targetDirectory, layout, group),
    sanitizePathSegment(group.repoName),
  )
}

function requireGitOrganization(
  course: PersistedCourse,
  operation: "repo.create" | "repo.clone",
): string {
  if (course.organization === null || course.organization.trim() === "") {
    throw createValidationAppError(
      "Course is missing organization for repository workflows.",
      [
        {
          path: "course.organization",
          message: `Set an organization before running ${operation}.`,
        },
      ],
    )
  }
  return course.organization
}

function normalizeRepositoryExecutionError(
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

export function createRepositoryWorkflowHandlers(
  ports: RepositoryWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"repo.create" | "repo.clone">,
  "repo.create" | "repo.clone"
> {
  return {
    "repo.create": async (
      input: RepositoryBatchInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryBatchResult> => {
      const totalSteps = 4
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Course does not reference a Git connection.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.create")

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(
          course,
          input.assignmentId,
          input.groupIds,
        )
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Creating repositories through Git provider client.",
        })
        const createResult = await ports.git.createRepositories(
          gitDraft,
          {
            organization,
            repositoryNames: uniqueRepositoryNames(planned.value),
            template: input.template,
          },
          options?.signal,
        )
        options?.onOutput?.({
          channel: "info",
          message: `Requested ${planned.value.length} repositories, provider created ${createResult.createdCount}.`,
        })

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Repository create workflow complete.",
        })

        return {
          repositoriesPlanned: planned.value.length,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "createRepositories",
        )
      }
    },
    "repo.clone": async (
      input: RepositoryBatchInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryBatchResult> => {
      const totalSteps = 5
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Course does not reference a Git connection.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.clone")

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(
          course,
          input.assignmentId,
          input.groupIds,
        )
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        if (planned.value.length === 0) {
          options?.onProgress?.({
            step: 5,
            totalSteps,
            label: "Repository clone workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            completedAt: new Date().toISOString(),
          }
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Resolving repository clone URLs with provider.",
        })
        const repositoryNames = uniqueRepositoryNames(planned.value)
        const resolved = await ports.git.resolveRepositoryCloneUrls(
          gitDraft,
          {
            organization,
            repositoryNames,
          },
          options?.signal,
        )
        const cloneUrlByRepoName = new Map(
          resolved.resolved.map((entry) => [
            entry.repositoryName,
            entry.cloneUrl,
          ]),
        )

        const targetDirectory = normalizeTargetDirectory(input.targetDirectory)
        const layout = normalizeDirectoryLayout(input.directoryLayout)
        const parentDirectories = new Set<string>([targetDirectory])
        const cloneTargets: Array<{
          repoName: string
          cloneUrl: string
          path: string
        }> = []
        for (const group of planned.value) {
          const cloneUrl = cloneUrlByRepoName.get(group.repoName)
          if (cloneUrl === undefined) {
            continue
          }
          const parentPath = repositoryCloneParentPath(
            targetDirectory,
            layout,
            group,
          )
          parentDirectories.add(parentPath)
          cloneTargets.push({
            repoName: group.repoName,
            cloneUrl,
            path: repositoryClonePath(targetDirectory, layout, group),
          })
        }

        try {
          await ports.fileSystem.applyBatch({
            operations: Array.from(parentDirectories).map((path) => ({
              kind: "ensure-directory" as const,
              path,
            })),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "ensureDirectories")
        }

        let inspected: Awaited<ReturnType<FileSystemPort["inspect"]>> = []
        try {
          inspected = await ports.fileSystem.inspect({
            paths: cloneTargets.map((target) => target.path),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "inspectCloneTargets")
        }
        const existingPathSet = new Set(
          inspected
            .filter((entry) => entry.kind !== "missing")
            .map((entry) => entry.path),
        )

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Cloning repositories via system git.",
        })
        let cloned = 0
        let failed = 0
        let skippedExisting = 0
        for (const target of cloneTargets) {
          if (existingPathSet.has(target.path)) {
            skippedExisting += 1
            continue
          }

          let result: ProcessResult
          try {
            result = await ports.gitCommand.run({
              args: ["clone", target.cloneUrl, target.path],
              signal: options?.signal,
            })
          } catch (error) {
            failed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `git clone failed for '${target.repoName}': ${error instanceof Error ? error.message : String(error)}`,
            })
            continue
          }
          if (result.exitCode === 0) {
            cloned += 1
            continue
          }
          failed += 1
          options?.onOutput?.({
            channel: "warn",
            message: `git clone failed for '${target.repoName}': ${result.stderr || result.stdout || "unknown error"}`,
          })
        }
        options?.onOutput?.({
          channel: "info",
          message: `Repository clone summary: planned ${planned.value.length}, cloned ${cloned}, missing remote ${resolved.missing.length}, existing local ${skippedExisting}, failed ${failed}.`,
        })

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Repository clone workflow complete.",
        })
        return {
          repositoriesPlanned: planned.value.length,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "resolveRepositoryCloneUrls",
        )
      }
    },
  }
}

function toCancelledAppError() {
  return createCancelledAppError()
}

function isSharedAppError(value: unknown): value is AppError {
  return isAppError(value)
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw toCancelledAppError()
  }
}

function normalizeUserFileError(
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

export async function runInspectUserFileWorkflow(
  userFilePort: UserFilePort,
  file: UserFileRef,
  options?: WorkflowCallOptions<SpikeWorkflowProgress, DiagnosticOutput>,
): Promise<UserFileInspectResult> {
  const totalSteps = 2

  try {
    throwIfAborted(options?.signal)
    options?.onProgress?.({
      step: 1,
      totalSteps,
      label: "Resolving opaque user-file reference.",
    })

    const fileText = await userFilePort.readText(file, options?.signal)

    throwIfAborted(options?.signal)
    options?.onOutput?.({
      channel: "info",
      message: `Loaded ${fileText.displayName} (${fileText.byteLength} bytes).`,
    })
    options?.onProgress?.({
      step: 2,
      totalSteps,
      label: "Summarizing imported file content.",
    })

    const lines = fileText.text.split(/\r?\n/)

    return {
      workflowId: "userFile.inspectSelection",
      displayName: fileText.displayName,
      byteLength: fileText.byteLength,
      lineCount: lines.filter((line) => line.length > 0).length,
      firstLine: lines[0] ?? null,
    }
  } catch (error) {
    throw normalizeUserFileError(error, "read")
  }
}

export async function runUserFileExportPreviewWorkflow(
  userFilePort: UserFilePort,
  target: UserSaveTargetRef,
  options?: WorkflowCallOptions<SpikeWorkflowProgress, DiagnosticOutput>,
): Promise<UserFileExportPreviewResult> {
  const totalSteps = 2
  const preview = [
    "student_id,display_name,git_username",
    "s-1001,Ada Lovelace,adal",
    "s-1002,Grace Hopper,ghopper",
  ].join("\n")

  try {
    throwIfAborted(options?.signal)
    options?.onProgress?.({
      step: 1,
      totalSteps,
      label: "Preparing browser-safe export payload.",
    })
    options?.onOutput?.({
      channel: "info",
      message: `Writing export preview to ${target.displayName}.`,
    })

    const receipt = await userFilePort.writeText(
      target,
      preview,
      options?.signal,
    )

    throwIfAborted(options?.signal)
    options?.onProgress?.({
      step: 2,
      totalSteps,
      label: "Export preview written through UserFilePort.",
    })

    return {
      workflowId: "userFile.exportPreview",
      displayName: receipt.displayName,
      preview,
      savedAt: receipt.savedAt,
    }
  } catch (error) {
    throw normalizeUserFileError(error, "write")
  }
}

// ---------------------------------------------------------------------------
// Spike e2e-trpc workflow (phase 1.3 proof-of-concept)
// ---------------------------------------------------------------------------

const spikeSteps = [
  "Use-case started in packages/application.",
  "Domain function called from packages/domain.",
  "Simulated async work completed.",
] as const

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toCancelledAppError())
      return
    }

    const timer = setTimeout(resolve, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(toCancelledAppError())
    }

    signal?.addEventListener("abort", abort, { once: true })
  })
}

export async function runSpikeWorkflow(
  options?: WorkflowCallOptions<SpikeWorkflowProgress, SpikeWorkflowOutput>,
): Promise<SpikeWorkflowResult> {
  const totalSteps = spikeSteps.length

  for (let i = 0; i < spikeSteps.length; i++) {
    options?.onProgress?.({
      step: i + 1,
      totalSteps,
      label: spikeSteps[i],
    })

    if (i === 1) {
      const domainMessage = formatSmokeWorkflowMessage("spike-workflow")
      options?.onOutput?.({ line: domainMessage })
    }

    await delay(80, options?.signal)
  }

  return {
    workflowId: "spike.e2e-trpc",
    message: formatSmokeWorkflowMessage("spike-workflow"),
    packageLine: [packageId, contractPackageId, domainPackageId].join(" -> "),
    executedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Spike CORS-constrained workflow (phase 1.3 — Node-side HTTP proof)
// ---------------------------------------------------------------------------

const corsSteps = [
  "Preparing CORS-constrained HTTP request.",
  "Executing HTTP request through Node-side HttpPort.",
  "Processing response from external API.",
] as const

export type SpikeCorsWorkflowPorts = {
  http: HttpPort
}

export async function runSpikeCorsWorkflow(
  ports: SpikeCorsWorkflowPorts,
  options?: WorkflowCallOptions<
    SpikeCorsWorkflowProgress,
    SpikeCorsWorkflowOutput
  >,
): Promise<SpikeCorsWorkflowResult> {
  const totalSteps = corsSteps.length

  options?.onProgress?.({ step: 1, totalSteps, label: corsSteps[0] })
  options?.onOutput?.({
    line: "This request would fail from a browser renderer due to CORS.",
  })

  await delay(60, options?.signal)

  options?.onProgress?.({ step: 2, totalSteps, label: corsSteps[1] })

  const response = await ports.http.fetch({
    url: "https://api.github.com/zen",
    headers: { Accept: "text/plain" },
    signal: options?.signal,
  })

  options?.onOutput?.({
    line: `HTTP ${response.status} ${response.statusText}`,
  })

  await delay(60, options?.signal)

  options?.onProgress?.({ step: 3, totalSteps, label: corsSteps[2] })

  return {
    workflowId: "spike.cors-http",
    executedIn: "node",
    httpStatus: response.status,
    bodySnippet: response.body.slice(0, 200),
    executedAt: new Date().toISOString(),
  }
}
