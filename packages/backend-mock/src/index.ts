import type {
  BackendAPI,
  CloseRequestedHandler,
  OpenDialogOptions,
  SaveDialogOptions,
  WindowTheme,
} from "@repo-edu/backend-interface"
import type {
  AffectedGroup,
  AppError,
  AppSettings,
  Assignment,
  AssignmentId,
  CloneConfig,
  CommandResult,
  CourseInfo,
  CourseVerifyResult,
  CoverageExportFormat,
  CoverageReport,
  CreateConfig,
  DeleteConfig,
  ExportSettings,
  GenerateFilesParams,
  GetGroupCategoriesParams,
  GitConnection,
  GitIdentityMode,
  GitVerifyResult,
  GroupCategory,
  GroupFilter,
  GroupImportConfig,
  ImportGitUsernamesResult,
  ImportGroupsResult,
  ImportStudentsResult,
  ImportSummary,
  LmsConnection,
  LmsGroup,
  LmsGroupSet,
  LmsOperationContext,
  LmsVerifyResult,
  OperationConfigs,
  OperationResult,
  ProfileSettings,
  RepoOperationContext,
  RepoPreflightResult,
  Result,
  Roster,
  SettingsLoadResult,
  Student,
  StudentId,
  StudentRemovalCheck,
  StudentSummary,
  UsernameVerificationResult,
  ValidationResult,
  VerifyCourseParams,
  VerifyCourseResult,
  VerifyGitUsernamesResult,
} from "@repo-edu/backend-interface/types"

const nowIso = () => new Date().toISOString()

const demoCourses: CourseInfo[] = [
  { id: "course-101", name: "Intro to Repositories" },
  { id: "course-202", name: "Team Workflows" },
]

const demoStudents: Student[] = [
  {
    id: "student-ada",
    name: "Ada Lovelace",
    email: "ada@example.edu",
    student_number: "1001",
    git_username: "ada-l",
    git_username_status: "valid",
    lms_user_id: "lms-101",
    custom_fields: {},
  },
  {
    id: "student-grace",
    name: "Grace Hopper",
    email: "grace@example.edu",
    student_number: "1002",
    git_username: "grace-h",
    git_username_status: "valid",
    lms_user_id: "lms-102",
    custom_fields: {},
  },
  {
    id: "student-alan",
    name: "Alan Turing",
    email: "alan@example.edu",
    student_number: "1003",
    git_username: "alan-t",
    git_username_status: "valid",
    lms_user_id: "lms-103",
    custom_fields: {},
  },
  {
    id: "student-katherine",
    name: "Katherine Johnson",
    email: "katherine@example.edu",
    student_number: "1004",
    git_username: "kjohnson",
    git_username_status: "valid",
    lms_user_id: "lms-104",
    custom_fields: {},
  },
  {
    id: "student-donald",
    name: "Donald Knuth",
    email: "donald@example.edu",
    student_number: "1005",
    git_username: "dknuth",
    git_username_status: "valid",
    lms_user_id: "lms-105",
    custom_fields: {},
  },
  {
    id: "student-margaret",
    name: "Margaret Hamilton",
    email: "margaret@example.edu",
    student_number: "1006",
    git_username: "mhamilton",
    git_username_status: "valid",
    lms_user_id: "lms-106",
    custom_fields: {},
  },
]

const demoAssignments: Assignment[] = [
  {
    id: "assignment-1",
    name: "Starter Repo",
    lms_group_set_id: "group-set-1",
    groups: [
      {
        id: "group-1",
        name: "Team Ada",
        member_ids: ["student-ada", "student-grace"],
      },
      {
        id: "group-2",
        name: "Team Alan",
        member_ids: ["student-alan", "student-katherine"],
      },
      {
        id: "group-3",
        name: "Team Donald",
        member_ids: ["student-donald", "student-margaret"],
      },
    ],
  },
  {
    id: "assignment-2",
    name: "Project Repo",
    lms_group_set_id: "group-set-2",
    groups: [
      {
        id: "group-4",
        name: "Project Apollo",
        member_ids: ["student-ada", "student-alan", "student-margaret"],
      },
      {
        id: "group-5",
        name: "Project Discovery",
        member_ids: ["student-grace", "student-katherine", "student-donald"],
      },
    ],
  },
]

const demoGroupSets: LmsGroupSet[] = [
  {
    id: "group-set-1",
    name: "Starter Teams",
    groups: demoAssignments[0].groups.map((group) => ({
      id: group.id,
      name: group.name,
      member_ids: group.member_ids,
    })),
  },
  {
    id: "group-set-2",
    name: "Project Teams",
    groups: demoAssignments[1].groups.map((group) => ({
      id: group.id,
      name: group.name,
      member_ids: group.member_ids,
    })),
  },
]

const demoGitConnection: GitConnection = {
  server_type: "GitHub",
  connection: {
    access_token: "demo-token",
    base_url: null,
    user: "demo-instructor",
  },
  identity_mode: "username",
}

const defaultOperations: OperationConfigs = {
  target_org: "demo-org",
  repo_name_template: "{assignment}-{group}",
  create: {
    template_org: "starter-templates",
  },
  clone: {
    target_dir: "/demo/repos",
    directory_layout: "by-team",
  },
  delete: {},
}

const defaultExports: ExportSettings = {
  output_folder: "/demo/exports",
  output_csv: true,
  output_xlsx: true,
  output_yaml: true,
  csv_file: "student-info.csv",
  xlsx_file: "student-info.xlsx",
  yaml_file: "students.yaml",
  member_option: "(email, gitid)",
  include_group: true,
  include_member: true,
  include_initials: false,
  full_groups: true,
}

const createProfileSettings = (course: CourseInfo): ProfileSettings => ({
  course,
  git_connection: "demo-github",
  operations: { ...defaultOperations },
  exports: { ...defaultExports },
})

const createRoster = (
  sourceKind: "lms" | "file" | "manual",
  fileName?: string,
): Roster => {
  const sourceBase = {
    kind: sourceKind,
  }

  if (sourceKind === "lms") {
    return {
      source: {
        ...sourceBase,
        lms_type: "canvas",
        base_url: "https://canvas.demo.edu",
        fetched_at: nowIso(),
      },
      students: demoStudents.map((student) => ({ ...student })),
      assignments: demoAssignments.map((assignment) => ({
        ...assignment,
        groups: assignment.groups.map((group) => ({
          ...group,
          member_ids: [...group.member_ids],
        })),
      })),
    }
  }

  if (sourceKind === "file") {
    return {
      source: {
        ...sourceBase,
        file_name: fileName ?? "students.csv",
        imported_at: nowIso(),
      },
      students: demoStudents.map((student) => ({ ...student })),
      assignments: demoAssignments.map((assignment) => ({
        ...assignment,
        groups: assignment.groups.map((group) => ({
          ...group,
          member_ids: [...group.member_ids],
        })),
      })),
    }
  }

  return {
    source: {
      ...sourceBase,
      created_at: nowIso(),
    },
    students: demoStudents.map((student) => ({ ...student })),
    assignments: demoAssignments.map((assignment) => ({
      ...assignment,
      groups: assignment.groups.map((group) => ({
        ...group,
        member_ids: [...group.member_ids],
      })),
    })),
  }
}

const defaultRoster = createRoster("lms")

const buildCoverageReport = (roster: Roster): CoverageReport => {
  const studentAssignments = new Map<string, Set<string>>()

  for (const assignment of roster.assignments) {
    for (const group of assignment.groups) {
      for (const memberId of group.member_ids) {
        const assignments =
          studentAssignments.get(memberId) ?? new Set<string>()
        assignments.add(assignment.name)
        studentAssignments.set(memberId, assignments)
      }
    }
  }

  const studentsInNone: StudentSummary[] = roster.students
    .filter((student) => !studentAssignments.has(student.id))
    .map((student) => ({ id: student.id, name: student.name }))

  const studentsInMultiple = roster.students
    .filter((student) => (studentAssignments.get(student.id)?.size ?? 0) > 1)
    .map((student) => ({
      student: { id: student.id, name: student.name },
      assignment_names: Array.from(studentAssignments.get(student.id) ?? []),
    }))

  const assignments = roster.assignments.map((assignment) => {
    const memberIds = new Set<string>()
    for (const group of assignment.groups) {
      for (const memberId of group.member_ids) {
        memberIds.add(memberId)
      }
    }

    const missingStudents = roster.students
      .filter((student) => !memberIds.has(student.id))
      .map((student) => ({ id: student.id, name: student.name }))

    return {
      assignment_id: assignment.id,
      assignment_name: assignment.name,
      student_count: memberIds.size,
      missing_students: missingStudents,
    }
  })

  return {
    total_students: roster.students.length,
    assignments,
    students_in_multiple: studentsInMultiple,
    students_in_none: studentsInNone,
  }
}

const mergeStudents = (
  roster: Roster,
  incoming: Student[],
): { roster: Roster; summary: ImportSummary } => {
  const byEmail = new Map(
    roster.students.map((student) => [student.email, student]),
  )
  let added = 0
  let updated = 0
  let unchanged = 0

  for (const student of incoming) {
    const existing = byEmail.get(student.email)
    if (!existing) {
      roster.students.push({ ...student })
      added += 1
      continue
    }

    const isSame =
      existing.name === student.name &&
      existing.student_number === student.student_number &&
      existing.git_username === student.git_username

    if (isSame) {
      unchanged += 1
    } else {
      Object.assign(existing, student)
      updated += 1
    }
  }

  return {
    roster,
    summary: {
      students_added: added,
      students_updated: updated,
      students_unchanged: unchanged,
      students_missing_email: 0,
    },
  }
}

const applyGroupFilter = (
  groups: LmsGroup[],
  filter: GroupFilter,
): LmsGroup[] => {
  if (filter.kind === "selected") {
    const selected = new Set(filter.selected ?? [])
    return groups.filter((group) => selected.has(group.id))
  }
  if (filter.kind === "pattern") {
    const pattern = filter.pattern?.trim() ?? ""
    if (!pattern) {
      return groups
    }
    return groups.filter((group) =>
      group.name.toLowerCase().includes(pattern.toLowerCase()),
    )
  }
  return groups
}

const rosterAssignment = (roster: Roster, assignmentId: AssignmentId) =>
  roster.assignments.find((assignment) => assignment.id === assignmentId) ??
  null

export class MockBackend implements BackendAPI {
  private profiles = new Map<string, ProfileSettings>()
  private rosters = new Map<string, Roster | null>()
  private activeProfile: string | null = "Demo Profile"
  private appSettings: AppSettings = {
    theme: "system",
    date_format: "DMY",
    time_format: "24h",
    lms_connection: {
      lms_type: "canvas",
      base_url: "https://canvas.demo.edu",
      access_token: "demo-token",
    },
    git_connections: {
      "demo-github": demoGitConnection,
    },
  }

  constructor() {
    const demoProfileName = "Demo Profile"
    const settings = createProfileSettings(demoCourses[0])
    this.profiles.set(demoProfileName, settings)
    this.rosters.set(demoProfileName, defaultRoster)

    // Add more demo profiles
    const cs101 = createProfileSettings(demoCourses[0])
    this.profiles.set("CS101 Intro", cs101)
    this.rosters.set("CS101 Intro", createRoster("manual"))

    const advGit = createProfileSettings(demoCourses[1])
    this.profiles.set("Advanced Git", advGit)
    this.rosters.set("Advanced Git", createRoster("manual"))

    const empty = createProfileSettings({ id: "", name: "" })
    this.profiles.set("Empty Profile", empty)
    this.rosters.set("Empty Profile", null)
  }

  private ok<T>(data: T): Promise<Result<T, AppError>> {
    return Promise.resolve({ status: "ok", data })
  }

  private ensureProfile(name: string): ProfileSettings {
    const existing = this.profiles.get(name)
    if (existing) {
      return existing
    }
    const fallback = createProfileSettings(demoCourses[0])
    this.profiles.set(name, fallback)
    this.rosters.set(name, createRoster("manual"))
    return fallback
  }

  async listProfiles(): Promise<Result<string[], AppError>> {
    return this.ok(Array.from(this.profiles.keys()).sort())
  }

  async getActiveProfile(): Promise<Result<string | null, AppError>> {
    return this.ok(this.activeProfile)
  }

  async setActiveProfile(name: string): Promise<Result<null, AppError>> {
    this.ensureProfile(name)
    this.activeProfile = name
    return this.ok(null)
  }

  async loadAppSettings(): Promise<Result<AppSettings, AppError>> {
    return this.ok({ ...this.appSettings })
  }

  async saveAppSettings(
    settings: AppSettings,
  ): Promise<Result<null, AppError>> {
    this.appSettings = { ...settings }
    return this.ok(null)
  }

  async getTokenInstructions(_: string): Promise<Result<string, AppError>> {
    return this.ok("Use a personal access token generated in your LMS profile.")
  }

  async openTokenUrl(_: string, __: string): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async verifyLmsCourse(
    _: VerifyCourseParams,
  ): Promise<Result<VerifyCourseResult, AppError>> {
    return this.ok({
      course_id: demoCourses[0].id,
      course_name: demoCourses[0].name,
    })
  }

  async generateLmsFiles(
    _: GenerateFilesParams,
    progress: (message: string) => void,
  ): Promise<Result<CommandResult, AppError>> {
    progress("Preparing student files...")
    progress("Generating repositories...")
    return this.ok({
      success: true,
      message: "Mock files generated",
      details: null,
    })
  }

  async getGroupCategories(
    params: GetGroupCategoriesParams,
  ): Promise<Result<GroupCategory[], AppError>> {
    const categories = demoGroupSets.map((set) => ({
      id: set.id,
      name: set.name,
      role: null,
      self_signup: null,
      course_id: params.course_id,
      group_limit: null,
    }))
    return this.ok(categories)
  }

  async verifyLmsConnection(
    _: LmsOperationContext,
  ): Promise<Result<LmsVerifyResult, AppError>> {
    return this.ok({
      success: true,
      message: "Connected to LMS",
      lms_type: "canvas",
    })
  }

  async verifyLmsConnectionDraft(
    _: LmsOperationContext,
  ): Promise<Result<LmsVerifyResult, AppError>> {
    return this.verifyLmsConnection(_)
  }

  async fetchLmsCourses(): Promise<Result<CourseInfo[], AppError>> {
    return this.ok(demoCourses)
  }

  async fetchLmsCoursesDraft(
    _: LmsConnection,
  ): Promise<Result<CourseInfo[], AppError>> {
    return this.ok(demoCourses)
  }

  async importStudentsFromLms(
    _: LmsOperationContext,
    roster: Roster | null,
  ): Promise<Result<ImportStudentsResult, AppError>> {
    const baseRoster = roster ? { ...roster } : createRoster("lms")
    baseRoster.source = {
      kind: "lms",
      lms_type: "canvas",
      base_url: "https://canvas.demo.edu",
      fetched_at: nowIso(),
    }

    const merged = mergeStudents(baseRoster, demoStudents)
    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, merged.roster)
    }
    return this.ok({ roster: merged.roster, summary: merged.summary })
  }

  async importStudentsFromFile(
    _: string,
    roster: Roster | null,
    filePath: string,
  ): Promise<Result<ImportStudentsResult, AppError>> {
    const baseRoster = roster ? { ...roster } : createRoster("file", filePath)
    baseRoster.source = {
      kind: "file",
      file_name: filePath.split("/").pop() ?? filePath,
      imported_at: nowIso(),
    }

    const merged = mergeStudents(baseRoster, demoStudents)
    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, merged.roster)
    }
    return this.ok({ roster: merged.roster, summary: merged.summary })
  }

  async fetchLmsGroupSets(
    _: LmsOperationContext,
  ): Promise<Result<LmsGroupSet[], AppError>> {
    return this.ok(demoGroupSets)
  }

  async fetchLmsGroupSetList(
    _: LmsOperationContext,
  ): Promise<Result<LmsGroupSet[], AppError>> {
    return this.ok(demoGroupSets.map((set) => ({ ...set, groups: [] })))
  }

  async fetchLmsGroupsForSet(
    _: LmsOperationContext,
    groupSetId: string,
  ): Promise<Result<LmsGroup[], AppError>> {
    const groupSet = demoGroupSets.find((set) => set.id === groupSetId)
    return this.ok(groupSet?.groups ?? [])
  }

  async importGroupsFromLms(
    _: LmsOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    config: GroupImportConfig,
  ): Promise<Result<ImportGroupsResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    if (!assignment) {
      return this.ok({
        summary: {
          groups_imported: 0,
          groups_replaced: 0,
          students_referenced: 0,
          filter_applied: "No assignment found",
        },
        roster,
      })
    }

    const groupSet = demoGroupSets.find((set) => set.id === config.group_set_id)
    const allGroups = groupSet?.groups ?? []
    const filtered = applyGroupFilter(allGroups, config.filter)

    const previousCount = assignment.groups.length
    assignment.groups = filtered.map((group) => ({
      id: group.id,
      name: group.name,
      member_ids: [...group.member_ids],
    }))

    const studentIds = new Set(filtered.flatMap((group) => group.member_ids))

    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, roster)
    }
    return this.ok({
      summary: {
        groups_imported: filtered.length,
        groups_replaced: previousCount,
        students_referenced: studentIds.size,
        filter_applied: config.filter.kind,
      },
      roster,
    })
  }

  async assignmentHasGroups(
    roster: Roster,
    assignmentId: AssignmentId,
  ): Promise<Result<boolean, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok(Boolean(assignment && assignment.groups.length > 0))
  }

  async verifyProfileCourse(
    profile: string,
  ): Promise<Result<CourseVerifyResult, AppError>> {
    const settings = this.ensureProfile(profile)
    return this.ok({
      success: true,
      message: "Course verified",
      updated_name: settings.course.name,
    })
  }

  async verifyGitConnection(
    name: string,
  ): Promise<Result<GitVerifyResult, AppError>> {
    const connection = this.appSettings.git_connections[name]
    if (!connection) {
      return this.ok({
        success: false,
        message: "Connection not found",
        username: null,
      })
    }
    return this.ok({
      success: true,
      message: "Git connection verified",
      username: connection.connection.user,
    })
  }

  async verifyGitConnectionDraft(
    connection: GitConnection,
  ): Promise<Result<GitVerifyResult, AppError>> {
    return this.ok({
      success: true,
      message: "Git connection verified",
      username: connection.connection.user,
    })
  }

  async loadProfile(
    name: string,
  ): Promise<Result<SettingsLoadResult, AppError>> {
    const settings = this.ensureProfile(name)
    return this.ok({ settings, warnings: [] })
  }

  async saveProfile(
    name: string,
    profile: ProfileSettings,
  ): Promise<Result<null, AppError>> {
    this.profiles.set(name, { ...profile })
    return this.ok(null)
  }

  async saveProfileAndRoster(
    name: string,
    profile: ProfileSettings,
    roster: Roster | null,
  ): Promise<Result<null, AppError>> {
    this.profiles.set(name, { ...profile })
    this.rosters.set(name, roster ? { ...roster } : null)
    return this.ok(null)
  }

  async deleteProfile(name: string): Promise<Result<null, AppError>> {
    this.profiles.delete(name)
    this.rosters.delete(name)
    if (this.activeProfile === name) {
      this.activeProfile = this.profiles.keys().next().value ?? null
    }
    return this.ok(null)
  }

  async renameProfile(
    oldName: string,
    newName: string,
  ): Promise<Result<null, AppError>> {
    const profile = this.ensureProfile(oldName)
    const roster = this.rosters.get(oldName) ?? null
    this.profiles.delete(oldName)
    this.rosters.delete(oldName)
    this.profiles.set(newName, { ...profile })
    this.rosters.set(newName, roster)
    if (this.activeProfile === oldName) {
      this.activeProfile = newName
    }
    return this.ok(null)
  }

  async createProfile(
    name: string,
    course: CourseInfo,
  ): Promise<Result<ProfileSettings, AppError>> {
    const settings = createProfileSettings(course)
    this.profiles.set(name, settings)
    this.rosters.set(name, createRoster("manual"))
    return this.ok(settings)
  }

  async loadSettings(): Promise<Result<SettingsLoadResult, AppError>> {
    const profileName = this.activeProfile ?? "Demo Profile"
    return this.loadProfile(profileName)
  }

  async resetSettings(): Promise<Result<ProfileSettings, AppError>> {
    const profileName = this.activeProfile ?? "Demo Profile"
    const settings = createProfileSettings(demoCourses[0])
    this.profiles.set(profileName, settings)
    return this.ok(settings)
  }

  async getDefaultSettings(): Promise<ProfileSettings> {
    return createProfileSettings(demoCourses[0])
  }

  async getSettingsPath(): Promise<Result<string, AppError>> {
    return this.ok("/demo/settings.json")
  }

  async settingsExist(): Promise<Result<boolean, AppError>> {
    return this.ok(true)
  }

  async importSettings(_: string): Promise<Result<ProfileSettings, AppError>> {
    const settings = createProfileSettings(demoCourses[0])
    return this.ok(settings)
  }

  async exportSettings(
    _: ProfileSettings,
    __: string,
  ): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async getSettingsSchema(): Promise<Result<string, AppError>> {
    return this.ok("{}")
  }

  async loadSettingsOrDefault(): Promise<Result<ProfileSettings, AppError>> {
    return this.ok(createProfileSettings(demoCourses[0]))
  }

  async listGitConnections(): Promise<Result<string[], AppError>> {
    return this.ok(Object.keys(this.appSettings.git_connections))
  }

  async getGitConnection(
    name: string,
  ): Promise<Result<GitConnection, AppError>> {
    const connection = this.appSettings.git_connections[name]
    return this.ok(connection ?? demoGitConnection)
  }

  async saveGitConnection(
    name: string,
    connection: GitConnection,
  ): Promise<Result<null, AppError>> {
    this.appSettings.git_connections = {
      ...this.appSettings.git_connections,
      [name]: connection,
    }
    return this.ok(null)
  }

  async deleteGitConnection(name: string): Promise<Result<null, AppError>> {
    const connections = { ...this.appSettings.git_connections }
    delete connections[name]
    this.appSettings.git_connections = connections
    return this.ok(null)
  }

  async getIdentityMode(
    connectionName: string,
  ): Promise<Result<GitIdentityMode, AppError>> {
    const connection = this.appSettings.git_connections[connectionName]
    return this.ok(connection?.identity_mode ?? "username")
  }

  async getRoster(profile: string): Promise<Result<Roster | null, AppError>> {
    return this.ok(this.rosters.get(profile) ?? null)
  }

  async clearRoster(profile: string): Promise<Result<null, AppError>> {
    this.rosters.set(profile, null)
    return this.ok(null)
  }

  async checkStudentRemoval(
    _: string,
    roster: Roster,
    studentId: StudentId,
  ): Promise<Result<StudentRemovalCheck, AppError>> {
    const student = roster.students.find((entry) => entry.id === studentId)
    const affected: AffectedGroup[] = []

    for (const assignment of roster.assignments) {
      for (const group of assignment.groups) {
        if (group.member_ids.includes(studentId)) {
          affected.push({
            assignment_id: assignment.id,
            assignment_name: assignment.name,
            group_id: group.id,
            group_name: group.name,
          })
        }
      }
    }

    return this.ok({
      student_id: studentId,
      student_name: student?.name ?? "Unknown",
      affected_groups: affected,
    })
  }

  async importGitUsernames(
    _: string,
    roster: Roster,
    __: string,
  ): Promise<Result<ImportGitUsernamesResult, AppError>> {
    const updated = roster.students.map((student) => ({
      ...student,
      git_username:
        student.git_username ??
        `${student.name.toLowerCase().split(" ")[0]}-demo`,
      git_username_status: "valid",
    }))

    const updatedRoster = { ...roster, students: updated }
    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, updatedRoster)
    }
    return this.ok({
      summary: {
        matched: updated.length,
        unmatched_emails: [],
      },
      roster: updatedRoster,
    })
  }

  async verifyGitUsernames(
    _: string,
    roster: Roster,
    __: "all" | "unknown_only",
  ): Promise<Result<VerifyGitUsernamesResult, AppError>> {
    const updated = roster.students.map((student) => ({
      ...student,
      git_username_status: "valid",
    }))

    const updatedRoster = { ...roster, students: updated }
    const verification: UsernameVerificationResult = {
      valid: updated.length,
      invalid: [],
      errors: [],
    }

    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, updatedRoster)
    }
    return this.ok({ verification, roster: updatedRoster })
  }

  async exportTeams(
    _: string,
    __: Roster,
    ___: AssignmentId,
    ____: string,
  ): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async exportStudents(_: Roster, __: string): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async exportAssignmentStudents(
    _: Roster,
    __: AssignmentId,
    ___: string,
  ): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async getRosterCoverage(
    roster: Roster,
  ): Promise<Result<CoverageReport, AppError>> {
    return this.ok(buildCoverageReport(roster))
  }

  async exportRosterCoverage(
    _: Roster,
    __: string,
    ___: CoverageExportFormat,
  ): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async validateRoster(_: Roster): Promise<Result<ValidationResult, AppError>> {
    return this.ok({ issues: [] })
  }

  async validateAssignment(
    _: GitIdentityMode,
    __: Roster,
    ___: AssignmentId,
  ): Promise<Result<ValidationResult, AppError>> {
    return this.ok({ issues: [] })
  }

  async preflightCreateRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: CreateConfig,
  ): Promise<Result<RepoPreflightResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok({
      collisions: [],
      ready_count: assignment?.groups.length ?? 0,
    })
  }

  async preflightCloneRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: CloneConfig,
  ): Promise<Result<RepoPreflightResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok({
      collisions: [],
      ready_count: assignment?.groups.length ?? 0,
    })
  }

  async preflightDeleteRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: DeleteConfig,
  ): Promise<Result<RepoPreflightResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok({
      collisions: [],
      ready_count: assignment?.groups.length ?? 0,
    })
  }

  async createRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: CreateConfig,
  ): Promise<Result<OperationResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok({
      succeeded: assignment?.groups.length ?? 0,
      failed: 0,
      skipped_groups: [],
      errors: [],
    })
  }

  async cloneReposFromRoster(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: CloneConfig,
  ): Promise<Result<OperationResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok({
      succeeded: assignment?.groups.length ?? 0,
      failed: 0,
      skipped_groups: [],
      errors: [],
    })
  }

  async deleteRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: DeleteConfig,
  ): Promise<Result<OperationResult, AppError>> {
    const assignment = rosterAssignment(roster, assignmentId)
    return this.ok({
      succeeded: assignment?.groups.length ?? 0,
      failed: 0,
      skipped_groups: [],
      errors: [],
    })
  }

  async revealProfilesDirectory(): Promise<Result<null, AppError>> {
    return this.ok(null)
  }

  async openDialog(options: OpenDialogOptions): Promise<string | null> {
    if (options.defaultPath) {
      return options.defaultPath
    }

    if (options.directory) {
      return "/demo/repos"
    }

    if (options.filters?.some((filter) => filter.extensions.includes("csv"))) {
      return "/demo/import.csv"
    }

    return "/demo/selection"
  }

  async saveDialog(options: SaveDialogOptions): Promise<string | null> {
    if (options.defaultPath) {
      return `/demo/${options.defaultPath}`
    }

    if (options.filters?.some((filter) => filter.extensions.includes("xlsx"))) {
      return "/demo/export.xlsx"
    }

    return "/demo/export.csv"
  }

  async listenEvent<T = unknown>(
    _: string,
    __: (payload: T) => void,
  ): Promise<() => void> {
    return () => {}
  }

  async onCloseRequested(_: CloseRequestedHandler): Promise<() => void> {
    return () => {}
  }

  async closeWindow(): Promise<void> {
    return
  }

  async setWindowTheme(_: WindowTheme): Promise<void> {
    return
  }

  async setWindowBackgroundColor(_: string): Promise<void> {
    return
  }
}
