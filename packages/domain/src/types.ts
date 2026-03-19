export const packageId = "@repo-edu/domain"

export const persistedAppSettingsKind = "repo-edu.app-settings.v1" as const
export const persistedCourseKind = "repo-edu.course.v1" as const

export const lmsProviderKinds = ["canvas", "moodle"] as const
export const gitProviderKinds = ["github", "gitlab", "gitea"] as const
export const gitUsernameStatusKinds = ["unknown", "valid", "invalid"] as const
export const memberStatusKinds = ["active", "incomplete", "dropped"] as const
export const enrollmentTypeKinds = [
  "student",
  "teacher",
  "ta",
  "designer",
  "observer",
  "other",
] as const
export const groupOriginKinds = ["system", "lms", "local"] as const

export type LmsProviderKind = (typeof lmsProviderKinds)[number]
export type GitProviderKind = (typeof gitProviderKinds)[number]
export type ProviderKind = LmsProviderKind | GitProviderKind | "git"
export type GitUsernameStatus = (typeof gitUsernameStatusKinds)[number]
export type MemberStatus = (typeof memberStatusKinds)[number]
export type EnrollmentType = (typeof enrollmentTypeKinds)[number]
export type GroupOrigin = (typeof groupOriginKinds)[number]
export type GitIdentityMode = "email" | "username"

export type FileFormat = "csv" | "xlsx" | "yaml" | "json"
export type ThemePreference = "system" | "light" | "dark"
export type WindowChromeMode = "system" | "hiddenInset"
export type DateFormatPreference = "MDY" | "DMY"
export type TimeFormatPreference = "12h" | "24h"
export type ExportFormat = Extract<FileFormat, "csv" | "xlsx" | "yaml">

export type PersistedLmsConnection = {
  name: string
  provider: LmsProviderKind
  baseUrl: string
  token: string
  userAgent?: string
}

export type PersistedGitConnection = {
  id: string
  provider: GitProviderKind
  baseUrl: string
  token: string
}

export type AppAppearance = {
  theme: ThemePreference
  windowChrome: WindowChromeMode
  dateFormat: DateFormatPreference
  timeFormat: TimeFormatPreference
}

export type PersistedAppSettings = {
  kind: typeof persistedAppSettingsKind
  schemaVersion: 1
  activeCourseId: string | null
  appearance: AppAppearance
  lmsConnections: PersistedLmsConnection[]
  gitConnections: PersistedGitConnection[]
  lastOpenedAt: string | null
  rosterColumnVisibility: Record<string, boolean>
  rosterColumnSizing: Record<string, number>
  groupsColumnVisibility: Record<string, boolean>
  groupsColumnSizing: Record<string, number>
}

export type RosterConnection =
  | {
      kind: "canvas"
      courseId: string
      lastUpdated: string
    }
  | {
      kind: "moodle"
      courseId: string
      lastUpdated: string
    }
  | {
      kind: "import"
      sourceFilename: string
      lastUpdated: string
    }

export type RosterMember = {
  id: string
  name: string
  email: string
  studentNumber: string | null
  gitUsername: string | null
  gitUsernameStatus: GitUsernameStatus
  status: MemberStatus
  lmsStatus: MemberStatus | null
  lmsUserId: string | null
  enrollmentType: EnrollmentType
  enrollmentDisplay: string | null
  department: string | null
  institution: string | null
  source: string
}

export type Roster = {
  connection: RosterConnection | null
  students: RosterMember[]
  staff: RosterMember[]
  groups: Group[]
  groupSets: GroupSet[]
  assignments: Assignment[]
}

export type LmsImportConflict = {
  matchKey: "lmsUserId" | "email" | "studentNumber"
  value: string
  matchedIds: string[]
}

export type RosterImportFromLmsSummary = {
  membersAdded: number
  membersUpdated: number
  membersUnchanged: number
  membersMissingEmail: number
}

export type RosterImportFromLmsResult = {
  roster: Roster
  summary: RosterImportFromLmsSummary
  conflicts: LmsImportConflict[]
  totalConflicts: number
}

export type Group = {
  id: string
  name: string
  memberIds: string[]
  origin: GroupOrigin
  lmsGroupId: string | null
}

export type GroupSelectionMode =
  | {
      kind: "all"
      excludedGroupIds: string[]
    }
  | {
      kind: "pattern"
      pattern: string
      excludedGroupIds: string[]
    }

export type GroupSetConnection =
  | {
      kind: "system"
      systemType: string
    }
  | {
      kind: "canvas"
      courseId: string
      groupSetId: string
      lastUpdated: string
    }
  | {
      kind: "moodle"
      courseId: string
      groupingId: string
      lastUpdated: string
    }
  | {
      kind: "import"
      sourceFilename: string
      sourcePath: string | null
      lastUpdated: string
    }

export type GroupSet = {
  id: string
  name: string
  groupIds: string[]
  connection: GroupSetConnection | null
  groupSelection: GroupSelectionMode
  repoNameTemplate: string | null
}

export type Assignment = {
  id: string
  name: string
  groupSetId: string
  repositoryTemplate?: RepositoryTemplate | null
  templateCommitSha?: string | null
}

export type RepositoryTemplateVisibility = "private" | "internal" | "public"

export type RemoteRepositoryTemplate = {
  kind: "remote"
  owner: string
  name: string
  visibility: RepositoryTemplateVisibility
}

export type LocalRepositoryTemplate = {
  kind: "local"
  path: string
  visibility: RepositoryTemplateVisibility
}

export type RepositoryTemplate =
  | RemoteRepositoryTemplate
  | LocalRepositoryTemplate

export type PersistedCourse = {
  kind: typeof persistedCourseKind
  schemaVersion: 1
  revision: number
  id: string
  displayName: string
  lmsConnectionName: string | null
  gitConnectionId: string | null
  organization: string | null
  lmsCourseId: string | null
  roster: Roster
  repositoryTemplate: RepositoryTemplate | null
  repositoryCloneTargetDirectory?: string | null
  repositoryCloneDirectoryLayout?: "flat" | "by-team" | "by-task" | null
  updatedAt: string
}

export type CourseSummary = Pick<
  PersistedCourse,
  "id" | "displayName" | "updatedAt"
>

export type ValidationIssue = {
  path: string
  message: string
}

export type ValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; issues: ValidationIssue[] }

export type PatternFilterResult = {
  valid: boolean
  error: string | null
  matchedIndexes: number[]
  matchedCount: number
}

export type GroupSelectionPreview = {
  valid: boolean
  error: string | null
  groupIds: string[]
  emptyGroupIds: string[]
  groupMemberCounts: Array<{
    groupId: string
    memberCount: number
  }>
  totalGroups: number
  matchedGroups: number
}

export type SystemGroupSetEnsureResult = {
  groupSets: GroupSet[]
  groupsUpserted: Group[]
  deletedGroupIds: string[]
}

export type GroupSetImportRow = {
  group_name: string
  group_id?: string
  name?: string
  email?: string
}

export type GroupSetImportSource = {
  sourceFilename: string
  sourcePath?: string | null
  lastUpdated?: string
}

export type GroupSetImportPreviewGroup = {
  name: string
  memberCount: number
}

export type GroupSetImportMissingMember = {
  groupName: string
  missingCount: number
}

export type GroupSetRenamedGroup = {
  from: string
  to: string
}

export type GroupSetImportPreview =
  | {
      mode: "import"
      groups: GroupSetImportPreviewGroup[]
      missingMembers: GroupSetImportMissingMember[]
      totalMissing: number
    }
  | {
      mode: "reimport"
      groups: GroupSetImportPreviewGroup[]
      missingMembers: GroupSetImportMissingMember[]
      totalMissing: number
      addedGroupNames: string[]
      removedGroupNames: string[]
      updatedGroupNames: string[]
      renamedGroups: GroupSetRenamedGroup[]
    }

export type GroupSetImportResult = {
  mode: "import" | "reimport"
  groupSet: GroupSet
  groupsUpserted: Group[]
  deletedGroupIds: string[]
  missingMembers: GroupSetImportMissingMember[]
  totalMissing: number
}

export type GroupSetExportRow = {
  group_set_id: string
  group_id: string
  group_name: string
  name: string
  email: string
}

export type RepoTeam = {
  members: string[]
  name: string
}

export type RepoOperationMode = "create" | "clone"

export type RepoCollisionKind = "already_exists" | "not_found"

export type RepoCollision = {
  groupId: string
  groupName: string
  repoName: string
  kind: RepoCollisionKind
}

export type RepoPreflightResult = {
  collisions: RepoCollision[]
  readyCount: number
}

export type SkippedGroupReason =
  | "empty_group"
  | "all_members_skipped"
  | "repo_exists"
  | "repo_not_found"

export type SkippedGroup = {
  assignmentId: string
  groupId: string
  groupName: string
  reason: SkippedGroupReason
  context: string | null
}

export type PlannedRepositoryGroup = {
  assignmentId: string
  assignmentName: string
  groupId: string
  groupName: string
  repoName: string
  activeMemberIds: string[]
}

export type RepositoryOperationPlan = {
  assignment: Assignment
  template: string
  groups: PlannedRepositoryGroup[]
  skippedGroups: SkippedGroup[]
}

export const groupSetExportHeaders = [
  "group_set_id",
  "group_id",
  "group_name",
  "name",
  "email",
] as const

export type RosterValidationKind =
  | "duplicate_student_id"
  | "missing_email"
  | "invalid_email"
  | "duplicate_email"
  | "duplicate_assignment_name"
  | "duplicate_group_id_in_assignment"
  | "duplicate_group_name_in_assignment"
  | "duplicate_repo_name_in_assignment"
  | "orphan_group_member"
  | "empty_group"
  | "system_group_sets_missing"
  | "invalid_enrollment_partition"
  | "invalid_group_origin"
  | "missing_git_username"
  | "invalid_git_username"
  | "unassigned_student"
  | "student_in_multiple_groups_in_assignment"

export type RosterValidationIssue = {
  kind: RosterValidationKind
  affectedIds: string[]
  context: string | null
}

export type RosterValidationResult = {
  issues: RosterValidationIssue[]
}

export type RosterMemberNormalizationInput = {
  id: unknown
  studentNumber?: unknown
  nameCandidates?: unknown[]
  displayNameCandidates?: unknown[]
  emailCandidates?: unknown[]
  gitUsername?: unknown
  gitUsernameStatus?: unknown
  status?: unknown
  lmsStatus?: unknown
  lmsUserId?: unknown
  enrollmentType?: unknown
  enrollmentDisplay?: unknown
  department?: unknown
  institution?: unknown
  source?: unknown
}

export const SYSTEM_TYPE_INDIVIDUAL_STUDENTS = "individual_students" as const
export const SYSTEM_TYPE_STAFF = "staff" as const
export const STAFF_GROUP_NAME = "staff" as const
export const ORIGIN_SYSTEM: GroupOrigin = "system"
export const ORIGIN_LMS: GroupOrigin = "lms"
export const ORIGIN_LOCAL: GroupOrigin = "local"

export type ResolvedGitUsername = {
  memberId: string
  gitUsername: string
}

export type ResolveGitUsernamesResult = {
  resolved: ResolvedGitUsername[]
  missing: string[]
}
