import type { AnalysisConfig } from "./analysis/config-types.js"

export const packageId = "@repo-edu/domain"

export const persistedAppSettingsKind = "repo-edu.app-settings.v1" as const
export const persistedAnalysisKind = "repo-edu.analysis.v1" as const
export const persistedCourseKind = "repo-edu.course.v1" as const

export type DocumentKind = "analysis" | "course"

export const gitProviderKinds = ["github", "gitlab", "gitea"] as const
export const courseKinds = ["lms", "repobee"] as const
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

export type LmsProviderKind = "canvas" | "moodle"
export type GitProviderKind = (typeof gitProviderKinds)[number]
export type CourseKind = (typeof courseKinds)[number]
export type ProviderKind = LmsProviderKind | GitProviderKind | "git"
export type GitUsernameStatus = (typeof gitUsernameStatusKinds)[number]
export type MemberStatus = (typeof memberStatusKinds)[number]
export type EnrollmentType = (typeof enrollmentTypeKinds)[number]
export type GroupOrigin = (typeof groupOriginKinds)[number]
export type GitIdentityMode = "email" | "username"

export type ActiveTab = "roster" | "groups-assignments" | "analysis"
export type FileFormat = "csv" | "xlsx" | "json" | "txt"
export type ThemePreference = "system" | "light" | "dark"
export type WindowChromeMode = "system" | "hiddenInset"
export type DateFormatPreference = "MDY" | "DMY"
export type TimeFormatPreference = "12h" | "24h"
export type ExportFormat = Extract<FileFormat, "csv" | "xlsx">

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
  idSequences: IdSequences
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

export type UsernameTeam = {
  id: string
  gitUsernames: string[]
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

export type GroupSetCommon = {
  id: string
  name: string
  connection: GroupSetConnection | null
  repoNameTemplate: string | null
  columnVisibility: Record<string, boolean>
  columnSizing: Record<string, number>
}

export type NamedGroupSet = GroupSetCommon & {
  nameMode: "named"
  groupIds: string[]
}

export type UsernameGroupSet = GroupSetCommon & {
  nameMode: "unnamed"
  teams: UsernameTeam[]
}

export type GroupSet = NamedGroupSet | UsernameGroupSet

export type Assignment = {
  id: string
  name: string
  groupSetId: string
  repositoryTemplate?: RepositoryTemplate | null
  templateCommitSha?: string | null
  repositories: Record<string /* groupId */, string /* repoName */>
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

export type IdSequences = {
  nextGroupSeq: number
  nextGroupSetSeq: number
  nextMemberSeq: number
  nextAssignmentSeq: number
  nextTeamSeq: number
}

export type AnalysisInputs = Omit<AnalysisConfig, "maxConcurrency">

/**
 * Shared shape held by both PersistedAnalysis and PersistedCourse. A Course is
 * (informally) AnalysisCore + teaching context (roster, LMS, assignments).
 * Functions that only need analysis configuration accept AnalysisCore directly.
 */
export type AnalysisCore = {
  searchFolder: string | null
  analysisInputs: AnalysisInputs
}

export type PersistedAnalysis = AnalysisCore & {
  kind: typeof persistedAnalysisKind
  revision: number
  id: string
  displayName: string
  updatedAt: string
}

export type PersistedCourse = AnalysisCore & {
  kind: typeof persistedCourseKind
  courseKind: CourseKind
  revision: number
  id: string
  displayName: string
  lmsConnectionName: string | null
  organization: string | null
  lmsCourseId: string | null
  idSequences: IdSequences
  roster: Roster
  repositoryTemplate: RepositoryTemplate | null
  repositoryCloneTargetDirectory?: string | null
  repositoryCloneDirectoryLayout?: "flat" | "by-team" | "by-task" | null
  updatedAt: string
}

export type PersistedDocument = PersistedAnalysis | PersistedCourse

export function documentKindOf(document: PersistedDocument): DocumentKind {
  return document.kind === persistedAnalysisKind ? "analysis" : "course"
}

export function courseHasRoster(course: PersistedCourse): boolean {
  return course.courseKind === "lms"
}

export function courseSupportsLms(course: PersistedCourse): boolean {
  return course.courseKind === "lms"
}

export function courseSupportsRepoBeeGroups(course: PersistedCourse): boolean {
  return course.courseKind === "repobee"
}

export function resolveAnalysisConfig(
  core: AnalysisCore,
  defaultExtensions: string[],
  maxConcurrency: number,
): AnalysisConfig {
  const extensions = core.analysisInputs.extensions ?? defaultExtensions
  return { ...core.analysisInputs, extensions, maxConcurrency }
}

export type BlankAnalysisFields = {
  displayName: string
  searchFolder?: string | null
  analysisInputs?: AnalysisInputs
}

export function createBlankAnalysis(
  id: string,
  updatedAt: string,
  fields: BlankAnalysisFields,
): PersistedAnalysis {
  return {
    kind: persistedAnalysisKind,
    revision: 0,
    id,
    displayName: fields.displayName,
    searchFolder: fields.searchFolder ?? null,
    analysisInputs: fields.analysisInputs ?? {},
    updatedAt,
  }
}

export type BlankCourseFields = {
  courseKind?: CourseKind
  displayName: string
  lmsConnectionName?: string | null
  organization?: string | null
  lmsCourseId?: string | null
  repositoryTemplate?: RepositoryTemplate | null
  searchFolder?: string | null
  analysisInputs?: AnalysisInputs
}

export function createBlankCourse(
  id: string,
  updatedAt: string,
  fields: BlankCourseFields,
): PersistedCourse {
  return {
    kind: persistedCourseKind,
    courseKind: fields.courseKind ?? "lms",
    revision: 0,
    id,
    displayName: fields.displayName,
    lmsConnectionName: fields.lmsConnectionName ?? null,
    organization: fields.organization ?? null,
    lmsCourseId: fields.lmsCourseId ?? null,
    idSequences: initialIdSequences(),
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: fields.repositoryTemplate ?? null,
    searchFolder: fields.searchFolder ?? null,
    analysisInputs: fields.analysisInputs ?? {},
    updatedAt,
  }
}

export type AnalysisSummary = Pick<
  PersistedAnalysis,
  "id" | "displayName" | "updatedAt"
>

export type CourseSummary = Pick<
  PersistedCourse,
  "id" | "displayName" | "updatedAt" | "courseKind"
>

export type DocumentSummary =
  | (AnalysisSummary & { kind: "analysis" })
  | (CourseSummary & { kind: "course" })

export type ValidationIssue = {
  path: string
  message: string
}

export type ValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; issues: ValidationIssue[] }

export type SystemGroupSetEnsureResult = {
  groupSets: GroupSet[]
  groupsUpserted: Group[]
  deletedGroupIds: string[]
  idSequences: IdSequences
}

export type GroupSetImportRow = {
  group_name: string
  name?: string
  email?: string
  git_username?: string
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

export type GroupSetImportFormat = "group-set-csv" | "repobee-students"

export type GroupSetImportMemberKey = "email" | "gitUsername"

export type RepoBeeTeamMembershipDiff = {
  previousUsernames: string[]
  nextUsernames: string[]
  addedUsernames: string[]
  removedUsernames: string[]
}

export type GroupSetImportPreview =
  | {
      mode: "import"
      groups: GroupSetImportPreviewGroup[]
      missingMembers: GroupSetImportMissingMember[]
      totalMissing: number
    }
  | {
      mode: "replace"
      addedTeams: string[][]
      removedTeams: string[][]
      changedTeams: RepoBeeTeamMembershipDiff[]
      unchangedTeams: string[][]
    }

export type GroupSetImportResult = {
  mode: "import" | "replace"
  groupSet: GroupSet
  groupsUpserted: Group[]
  deletedGroupIds: string[]
  missingMembers: GroupSetImportMissingMember[]
  totalMissing: number
  idSequences: IdSequences
}

export type GroupSetExportRow = {
  group_name: string
  name: string
  email: string
}

export type RepoOperationMode = "create" | "clone" | "update"

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
  | "no_record_no_members"

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
  gitUsernames: string[]
  isRecorded: boolean
}

export type RepositoryOperationPlan = {
  assignment: Assignment
  template: string
  groups: PlannedRepositoryGroup[]
  skippedGroups: SkippedGroup[]
}

export const groupSetExportHeaders = ["group_name", "name", "email"] as const

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
  id?: unknown
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

export function initialIdSequences(): IdSequences {
  return {
    nextGroupSeq: 1,
    nextGroupSetSeq: 1,
    nextMemberSeq: 1,
    nextAssignmentSeq: 1,
    nextTeamSeq: 1,
  }
}

export type ResolvedGitUsername = {
  memberId: string
  gitUsername: string
}

export type ResolveGitUsernamesResult = {
  resolved: ResolvedGitUsername[]
  missing: string[]
}
