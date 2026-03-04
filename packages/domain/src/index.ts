export const packageId = "@repo-edu/domain"

export const persistedAppSettingsKind = "repo-edu.app-settings.v1" as const
export const persistedProfileKind = "repo-edu.profile.v1" as const

export const lmsProviderKinds = ["canvas", "moodle"] as const
export const gitProviderKinds = ["github", "gitlab", "gitea"] as const

export type LmsProviderKind = (typeof lmsProviderKinds)[number]
export type GitProviderKind = (typeof gitProviderKinds)[number]
export type ProviderKind = LmsProviderKind | GitProviderKind | "git"

export type FileFormat = "csv" | "xlsx" | "yaml" | "json"
export type ThemePreference = "system" | "light" | "dark"
export type WindowChromeMode = "system" | "hiddenInset"
export type ExportFormat = Extract<FileFormat, "csv" | "xlsx" | "yaml">

export type PersistedLmsConnection = {
  name: string
  provider: LmsProviderKind
  baseUrl: string
  token: string
}

export type PersistedGitConnection = {
  name: string
  provider: GitProviderKind
  baseUrl: string | null
  token: string
  organization: string | null
}

export type AppAppearance = {
  theme: ThemePreference
  windowChrome: WindowChromeMode
}

export type PersistedAppSettings = {
  kind: typeof persistedAppSettingsKind
  schemaVersion: 1
  activeProfileId: string | null
  appearance: AppAppearance
  lmsConnections: PersistedLmsConnection[]
  gitConnections: PersistedGitConnection[]
  lastOpenedAt: string | null
}

export type RosterStudent = {
  id: string
  studentNumber: string | null
  displayName: string
  email: string | null
  gitUsername: string | null
}

export type Roster = {
  students: RosterStudent[]
}

export type GroupMember = {
  studentId: string
}

export type Group = {
  id: string
  name: string
  members: GroupMember[]
}

export type GroupSet = {
  id: string
  name: string
  groups: Group[]
  source:
    | "system"
    | "lms"
    | "import"
    | "manual"
}

export type Assignment = {
  id: string
  name: string
  groupSetId: string | null
}

export type RepositoryTemplate = {
  owner: string
  name: string
  visibility: "private" | "internal" | "public"
}

export type PersistedProfile = {
  kind: typeof persistedProfileKind
  schemaVersion: 1
  id: string
  displayName: string
  lmsConnectionName: string | null
  gitConnectionName: string | null
  courseId: string | null
  roster: Roster
  groupSets: GroupSet[]
  assignments: Assignment[]
  repositoryTemplate: RepositoryTemplate | null
  updatedAt: string
}

export type ProfileSummary = Pick<
  PersistedProfile,
  "id" | "displayName" | "updatedAt"
>

export type ValidationIssue = {
  path: string
  message: string
}

export type ValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; issues: ValidationIssue[] }

export const defaultAppSettings: PersistedAppSettings = {
  kind: persistedAppSettingsKind,
  schemaVersion: 1,
  activeProfileId: null,
  appearance: {
    theme: "system",
    windowChrome: "system",
  },
  lmsConnections: [],
  gitConnections: [],
  lastOpenedAt: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark"
}

function isWindowChromeMode(value: unknown): value is WindowChromeMode {
  return value === "system" || value === "hiddenInset"
}

function isLmsProviderKind(value: unknown): value is LmsProviderKind {
  return lmsProviderKinds.includes(value as LmsProviderKind)
}

function isGitProviderKind(value: unknown): value is GitProviderKind {
  return gitProviderKinds.includes(value as GitProviderKind)
}

function isRosterStudent(value: unknown): value is RosterStudent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isNullableString(value.studentNumber) &&
    isString(value.displayName) &&
    isNullableString(value.email) &&
    isNullableString(value.gitUsername)
  )
}

function isGroupMember(value: unknown): value is GroupMember {
  return isRecord(value) && isString(value.studentId)
}

function isGroup(value: unknown): value is Group {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    Array.isArray(value.members) &&
    value.members.every(isGroupMember)
  )
}

function isGroupSet(value: unknown): value is GroupSet {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    Array.isArray(value.groups) &&
    value.groups.every(isGroup) &&
    (value.source === "system" ||
      value.source === "lms" ||
      value.source === "import" ||
      value.source === "manual")
  )
}

function isAssignment(value: unknown): value is Assignment {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.groupSetId)
  )
}

function isRepositoryTemplate(value: unknown): value is RepositoryTemplate {
  return (
    isRecord(value) &&
    isString(value.owner) &&
    isString(value.name) &&
    (value.visibility === "private" ||
      value.visibility === "internal" ||
      value.visibility === "public")
  )
}

export function validatePersistedAppSettings(
  value: unknown,
): ValidationResult<PersistedAppSettings> {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "App settings must be an object." }],
    }
  }

  const issues: ValidationIssue[] = []

  if (value.kind !== persistedAppSettingsKind) {
    issues.push({
      path: "kind",
      message: `Expected ${persistedAppSettingsKind}.`,
    })
  }

  if (value.schemaVersion !== 1) {
    issues.push({
      path: "schemaVersion",
      message: "Expected schemaVersion 1.",
    })
  }

  if (!isNullableString(value.activeProfileId)) {
    issues.push({
      path: "activeProfileId",
      message: "activeProfileId must be a string or null.",
    })
  }

  if (!isNullableString(value.lastOpenedAt)) {
    issues.push({
      path: "lastOpenedAt",
      message: "lastOpenedAt must be a string or null.",
    })
  }

  const appearance = isRecord(value.appearance) ? value.appearance : {}
  const theme = isThemePreference(appearance.theme)
    ? appearance.theme
    : defaultAppSettings.appearance.theme
  const windowChrome = isWindowChromeMode(appearance.windowChrome)
    ? appearance.windowChrome
    : defaultAppSettings.appearance.windowChrome

  if (!isRecord(value.appearance)) {
    issues.push({
      path: "appearance",
      message: "appearance must be an object.",
    })
  }

  const lmsConnections = Array.isArray(value.lmsConnections)
    ? value.lmsConnections.flatMap((connection, index) => {
        if (
          !isRecord(connection) ||
          !isString(connection.name) ||
          !isLmsProviderKind(connection.provider) ||
          !isString(connection.baseUrl) ||
          !isString(connection.token)
        ) {
          issues.push({
            path: `lmsConnections[${index}]`,
            message: "Each LMS connection must match the persisted shape.",
          })
          return []
        }

        return [
          {
            name: connection.name,
            provider: connection.provider,
            baseUrl: connection.baseUrl,
            token: connection.token,
          },
        ]
      })
    : []

  if (!Array.isArray(value.lmsConnections)) {
    issues.push({
      path: "lmsConnections",
      message: "lmsConnections must be an array.",
    })
  }

  const gitConnections = Array.isArray(value.gitConnections)
    ? value.gitConnections.flatMap((connection, index) => {
        if (
          !isRecord(connection) ||
          !isString(connection.name) ||
          !isGitProviderKind(connection.provider) ||
          !isNullableString(connection.baseUrl) ||
          !isString(connection.token) ||
          !isNullableString(connection.organization)
        ) {
          issues.push({
            path: `gitConnections[${index}]`,
            message: "Each Git connection must match the persisted shape.",
          })
          return []
        }

        return [
          {
            name: connection.name,
            provider: connection.provider,
            baseUrl: connection.baseUrl,
            token: connection.token,
            organization: connection.organization,
          },
        ]
      })
    : []

  if (!Array.isArray(value.gitConnections)) {
    issues.push({
      path: "gitConnections",
      message: "gitConnections must be an array.",
    })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const activeProfileId = value.activeProfileId as string | null
  const lastOpenedAt = value.lastOpenedAt as string | null

  return {
    ok: true,
    value: {
      kind: persistedAppSettingsKind,
      schemaVersion: 1,
      activeProfileId,
      appearance: { theme, windowChrome },
      lmsConnections,
      gitConnections,
      lastOpenedAt,
    },
  }
}

export function validatePersistedProfile(
  value: unknown,
): ValidationResult<PersistedProfile> {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Profile must be an object." }],
    }
  }

  const issues: ValidationIssue[] = []

  if (value.kind !== persistedProfileKind) {
    issues.push({
      path: "kind",
      message: `Expected ${persistedProfileKind}.`,
    })
  }

  if (value.schemaVersion !== 1) {
    issues.push({
      path: "schemaVersion",
      message: "Expected schemaVersion 1.",
    })
  }

  if (!isString(value.id)) {
    issues.push({ path: "id", message: "id must be a string." })
  }

  if (!isString(value.displayName)) {
    issues.push({
      path: "displayName",
      message: "displayName must be a string.",
    })
  }

  if (!isNullableString(value.lmsConnectionName)) {
    issues.push({
      path: "lmsConnectionName",
      message: "lmsConnectionName must be a string or null.",
    })
  }

  if (!isNullableString(value.gitConnectionName)) {
    issues.push({
      path: "gitConnectionName",
      message: "gitConnectionName must be a string or null.",
    })
  }

  if (!isNullableString(value.courseId)) {
    issues.push({
      path: "courseId",
      message: "courseId must be a string or null.",
    })
  }

  if (!isString(value.updatedAt)) {
    issues.push({
      path: "updatedAt",
      message: "updatedAt must be a string.",
    })
  }

  const rosterStudents =
    isRecord(value.roster) && Array.isArray(value.roster.students)
      ? value.roster.students.filter(isRosterStudent)
      : []

  if (
    !isRecord(value.roster) ||
    !Array.isArray(value.roster.students) ||
    rosterStudents.length !== value.roster.students.length
  ) {
    issues.push({
      path: "roster.students",
      message: "roster.students must contain valid students.",
    })
  }

  const groupSets = Array.isArray(value.groupSets)
    ? value.groupSets.filter(isGroupSet)
    : []

  if (!Array.isArray(value.groupSets) || groupSets.length !== value.groupSets.length) {
    issues.push({
      path: "groupSets",
      message: "groupSets must contain valid group sets.",
    })
  }

  const assignments = Array.isArray(value.assignments)
    ? value.assignments.filter(isAssignment)
    : []

  if (
    !Array.isArray(value.assignments) ||
    assignments.length !== value.assignments.length
  ) {
    issues.push({
      path: "assignments",
      message: "assignments must contain valid assignments.",
    })
  }

  const repositoryTemplate =
    value.repositoryTemplate === null || isRepositoryTemplate(value.repositoryTemplate)
      ? value.repositoryTemplate
      : null

  if (
    value.repositoryTemplate !== null &&
    value.repositoryTemplate !== undefined &&
    !isRepositoryTemplate(value.repositoryTemplate)
  ) {
    issues.push({
      path: "repositoryTemplate",
      message: "repositoryTemplate must be null or a valid template.",
    })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const id = value.id as string
  const displayName = value.displayName as string
  const lmsConnectionName = value.lmsConnectionName as string | null
  const gitConnectionName = value.gitConnectionName as string | null
  const courseId = value.courseId as string | null
  const updatedAt = value.updatedAt as string

  return {
    ok: true,
    value: {
      kind: persistedProfileKind,
      schemaVersion: 1,
      id,
      displayName,
      lmsConnectionName,
      gitConnectionName,
      courseId,
      roster: { students: rosterStudents },
      groupSets,
      assignments,
      repositoryTemplate,
      updatedAt,
    },
  }
}

export function formatSmokeWorkflowMessage(source: string) {
  return `Shared workflow executed from ${source}.`
}
