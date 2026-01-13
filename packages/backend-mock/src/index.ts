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
  AssignmentId,
  CloneConfig,
  CommandResult,
  CourseInfo,
  CourseVerifyResult,
  CoverageExportFormat,
  CoverageReport,
  CreateConfig,
  DeleteConfig,
  GenerateFilesParams,
  GetGroupCategoriesParams,
  GitConnection,
  GitIdentityMode,
  GitUsernameStatus,
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
import {
  type CourseType,
  createProfileSettings,
  cs101Assignments,
  cs101GroupSets,
  cs201Assignments,
  cs201GroupSets,
  cs201Students,
  demoCourses,
  demoGitConnection,
  demoStudents,
} from "./data"

const nowIso = () => new Date().toISOString()

const createRoster = (
  sourceKind: "lms" | "file" | "manual",
  courseType: CourseType,
  fileName?: string,
): Roster => {
  const students = courseType === "cs101" ? demoStudents : cs201Students
  const assignments =
    courseType === "cs101" ? cs101Assignments : cs201Assignments

  const sourceBase = {
    kind: sourceKind,
  }

  const copyStudents = () => students.map((student) => ({ ...student }))
  const copyAssignments = () =>
    assignments.map((assignment) => ({
      ...assignment,
      groups: assignment.groups.map((group) => ({
        ...group,
        member_ids: [...group.member_ids],
      })),
    }))

  if (sourceKind === "lms") {
    return {
      source: {
        ...sourceBase,
        lms_type: "canvas",
        base_url: "https://canvas.university.edu",
        fetched_at: nowIso(),
      },
      students: copyStudents(),
      assignments: copyAssignments(),
    }
  }

  if (sourceKind === "file") {
    return {
      source: {
        ...sourceBase,
        file_name: fileName ?? "students.csv",
        imported_at: nowIso(),
      },
      students: copyStudents(),
      assignments: copyAssignments(),
    }
  }

  return {
    source: {
      ...sourceBase,
      created_at: nowIso(),
    },
    students: copyStudents(),
    assignments: copyAssignments(),
  }
}

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
  private activeProfile: string | null = "CS101 2026"
  private appSettings: AppSettings = {
    theme: "system",
    date_format: "DMY",
    time_format: "24h",
    lms_connection: {
      lms_type: "canvas",
      base_url: "https://canvas.university.edu",
      access_token: "demo-token",
    },
    git_connections: {
      "demo-github": demoGitConnection,
    },
  }

  constructor() {
    // Profile 1: CS 101 course
    const cs101Settings = createProfileSettings(demoCourses[0])
    this.profiles.set("CS101 2026", cs101Settings)
    this.rosters.set("CS101 2026", createRoster("lms", "cs101"))

    // Profile 2: CS 201 course
    const cs201Settings = createProfileSettings(demoCourses[1])
    this.profiles.set("CS201 2026", cs201Settings)
    this.rosters.set("CS201 2026", createRoster("lms", "cs201"))
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
    this.rosters.set(name, createRoster("manual", "cs101"))
    return fallback
  }

  private getCourseType(): CourseType {
    // Determine course type from active profile name
    if (this.activeProfile?.includes("201")) {
      return "cs201"
    }
    return "cs101"
  }

  private getGroupSets(): LmsGroupSet[] {
    return this.getCourseType() === "cs201" ? cs201GroupSets : cs101GroupSets
  }

  private getStudents(): Student[] {
    return this.getCourseType() === "cs201" ? cs201Students : demoStudents
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
    const categories = this.getGroupSets().map((set) => ({
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
    const courseType = this.getCourseType()
    const baseRoster = roster ? { ...roster } : createRoster("lms", courseType)
    baseRoster.source = {
      kind: "lms",
      lms_type: "canvas",
      base_url: "https://canvas.university.edu",
      fetched_at: nowIso(),
    }

    const merged = mergeStudents(baseRoster, this.getStudents())
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
    const courseType = this.getCourseType()
    const baseRoster = roster
      ? { ...roster }
      : createRoster("file", courseType, filePath)
    baseRoster.source = {
      kind: "file",
      file_name: filePath.split("/").pop() ?? filePath,
      imported_at: nowIso(),
    }

    const merged = mergeStudents(baseRoster, this.getStudents())
    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, merged.roster)
    }
    return this.ok({ roster: merged.roster, summary: merged.summary })
  }

  async fetchLmsGroupSets(
    _: LmsOperationContext,
  ): Promise<Result<LmsGroupSet[], AppError>> {
    return this.ok(this.getGroupSets())
  }

  async fetchLmsGroupSetList(
    _: LmsOperationContext,
  ): Promise<Result<LmsGroupSet[], AppError>> {
    return this.ok(this.getGroupSets().map((set) => ({ ...set, groups: [] })))
  }

  async fetchLmsGroupsForSet(
    _: LmsOperationContext,
    groupSetId: string,
  ): Promise<Result<LmsGroup[], AppError>> {
    const groupSet = this.getGroupSets().find((set) => set.id === groupSetId)
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

    const groupSet = this.getGroupSets().find(
      (set) => set.id === config.group_set_id,
    )
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
    this.rosters.set(name, createRoster("manual", "cs101"))
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
      git_username_status: "valid" as GitUsernameStatus,
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
      git_username_status: "valid" as GitUsernameStatus,
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
