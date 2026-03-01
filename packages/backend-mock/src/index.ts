import type {
  BackendAPI,
  CloseRequestedHandler,
  OpenDialogOptions,
  ProgressCallback,
  SaveDialogOptions,
  WindowTheme,
} from "@repo-edu/backend-interface"
import type {
  AppError,
  AppSettings,
  AssignmentId,
  CloneConfig,
  CommandResult,
  CourseInfo,
  CourseVerifyResult,
  CreateConfig,
  DeleteConfig,
  GenerateFilesParams,
  GetGroupCategoriesParams,
  GitConnection,
  GitIdentityMode,
  GitUsernameStatus,
  GitVerifyResult,
  Group,
  GroupCategory,
  GroupSelectionMode,
  GroupSelectionPreview,
  GroupSetImportPreview,
  GroupSetImportResult,
  GroupSetSyncResult,
  ImportGitUsernamesResult,
  ImportRosterResult,
  ImportStudentsResult,
  ImportSummary,
  LmsConnection,
  LmsContextKey,
  LmsGroup,
  LmsGroupSet,
  LmsOperationContext,
  LmsType,
  LmsVerifyResult,
  OperationResult,
  PatternFilterResult,
  ProfileSettings,
  RepoOperationContext,
  RepoPreflightResult,
  Result,
  Roster,
  RosterMember,
  SettingsLoadResult,
  SystemGroupSetEnsureResult,
  UsernameVerificationResult,
  ValidationResult,
  VerifyCourseParams,
  VerifyCourseResult,
  VerifyGitUsernamesResult,
} from "@repo-edu/backend-interface/types"
import {
  buildCs101Roster,
  buildCs201Roster,
  type CourseType,
  createProfileSettings,
  cs101GroupSets,
  cs201GroupSets,
  cs201Students,
  demoCourses,
  demoGitConnection,
  demoStudents,
} from "./data"

const nowIso = () => new Date().toISOString()

/**
 * Resolve groups for an assignment via its group_set_id and group_selection.
 */
function resolveAssignmentGroups(
  roster: Roster,
  assignmentId: AssignmentId,
): { id: string; name: string; member_ids: string[] }[] {
  const assignment = roster.assignments.find((a) => a.id === assignmentId)
  if (!assignment) return []

  const groupSet = roster.group_sets.find(
    (gs) => gs.id === assignment.group_set_id,
  )
  if (!groupSet) return []

  const groupMap = new Map(roster.groups.map((g) => [g.id, g]))

  let resolvedIds = groupSet.group_ids
  const sel = groupSet.group_selection

  if (sel.kind === "pattern") {
    const pattern = sel.pattern.toLowerCase()
    resolvedIds = resolvedIds.filter((gid) => {
      const g = groupMap.get(gid)
      return g ? g.name.toLowerCase().includes(pattern) : false
    })
  }

  if (sel.excluded_group_ids.length > 0) {
    const excluded = new Set(sel.excluded_group_ids)
    resolvedIds = resolvedIds.filter((gid) => !excluded.has(gid))
  }

  return resolvedIds
    .map((gid) => groupMap.get(gid))
    .filter((g): g is Group => !!g)
}

const mergeStudents = (
  roster: Roster,
  incoming: RosterMember[],
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

function createRoster(courseType: CourseType): Roster {
  return courseType === "cs101" ? buildCs101Roster() : buildCs201Roster()
}

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
    roster_column_visibility: {},
    roster_column_sizing: {},
  }

  constructor() {
    const cs101Settings = createProfileSettings(demoCourses[0])
    this.profiles.set("CS101 2026", cs101Settings)
    this.rosters.set("CS101 2026", createRoster("cs101"))

    const cs201Settings = createProfileSettings(demoCourses[1])
    this.profiles.set("CS201 2026", cs201Settings)
    this.rosters.set("CS201 2026", createRoster("cs201"))
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
    this.rosters.set(name, createRoster("cs101"))
    return fallback
  }

  private getCourseType(): CourseType {
    if (this.activeProfile?.includes("201")) {
      return "cs201"
    }
    return "cs101"
  }

  private getGroupSets(): LmsGroupSet[] {
    return this.getCourseType() === "cs201" ? cs201GroupSets : cs101GroupSets
  }

  private getStudents(): RosterMember[] {
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
    const baseRoster = roster ? { ...roster } : createRoster(courseType)
    baseRoster.connection = {
      kind: "canvas",
      course_id: courseType === "cs101" ? "48291" : "48350",
      last_updated: nowIso(),
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
    const baseRoster = roster ? { ...roster } : createRoster(courseType)
    baseRoster.connection = {
      kind: "import",
      source_filename: filePath.split("/").pop() ?? filePath,
      last_updated: nowIso(),
    }

    const merged = mergeStudents(baseRoster, this.getStudents())
    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, merged.roster)
    }
    return this.ok({ roster: merged.roster, summary: merged.summary })
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

  async syncGroupSet(
    _context: LmsOperationContext,
    roster: Roster,
    groupSetId: string,
  ): Promise<Result<GroupSetSyncResult, AppError>> {
    const gs = roster.group_sets.find((s) => s.id === groupSetId)
    if (!gs) {
      return this.ok({
        group_set: {
          id: groupSetId,
          name: "Unknown",
          group_ids: [],
          connection: null,
          group_selection: { kind: "all", excluded_group_ids: [] },
        },
        groups_upserted: [],
        deleted_group_ids: [],
        missing_members: [],
        total_missing: 0,
      })
    }
    return this.ok({
      group_set: { ...gs },
      groups_upserted: roster.groups.filter((g) => gs.group_ids.includes(g.id)),
      deleted_group_ids: [],
      missing_members: [],
      total_missing: 0,
    })
  }

  async importRosterFromLms(
    _context: LmsOperationContext,
    roster: Roster | null,
    progress: ProgressCallback<string>,
  ): Promise<Result<ImportRosterResult, AppError>> {
    const courseType = this.getCourseType()
    const baseRoster = roster ? { ...roster } : createRoster(courseType)
    baseRoster.connection = {
      kind: "canvas",
      course_id: courseType === "cs101" ? "48291" : "48350",
      last_updated: nowIso(),
    }

    const lmsMembers = this.getStudents()
    const pageSize = 100

    progress("Connecting to LMS...")
    progress("Fetching roster pages from LMS...")
    for (let index = 0; index < lmsMembers.length; index += pageSize) {
      const loadedUsers = Math.min(index + pageSize, lmsMembers.length)
      const page = Math.floor(index / pageSize) + 1
      progress(`Fetched roster page ${page} (${loadedUsers} users loaded)`)
    }
    progress(`Building roster preview for ${lmsMembers.length} users...`)

    const merged = mergeStudents(baseRoster, lmsMembers)
    if (this.activeProfile) {
      this.rosters.set(this.activeProfile, merged.roster)
    }
    return this.ok({
      summary: merged.summary,
      roster: merged.roster,
      conflicts: [],
      total_conflicts: 0,
    })
  }

  async ensureSystemGroupSets(
    roster: Roster,
  ): Promise<Result<SystemGroupSetEnsureResult, AppError>> {
    const individualGroups = roster.students.map((s) => ({
      id: `sys-ind-${s.id}`,
      name: s.name,
      member_ids: [s.id],
      origin: "system" as const,
      lms_group_id: null,
    }))
    const staffGroup = {
      id: "sys-staff",
      name: "Staff",
      member_ids: roster.staff.map((s) => s.id),
      origin: "system" as const,
      lms_group_id: null,
    }

    const allGroups = [...individualGroups, staffGroup]
    const indGroupSet = {
      id: "sys-gs-individual",
      name: "Individual Students",
      group_ids: individualGroups.map((g) => g.id),
      connection: {
        kind: "system" as const,
        system_type: "individual_students" as const,
      },
      group_selection: {
        kind: "all" as const,
        excluded_group_ids: [] as string[],
      },
    }
    const staffGroupSet = {
      id: "sys-gs-staff",
      name: "Staff",
      group_ids: [staffGroup.id],
      connection: { kind: "system" as const, system_type: "staff" as const },
      group_selection: {
        kind: "all" as const,
        excluded_group_ids: [] as string[],
      },
    }

    return this.ok({
      group_sets: [indGroupSet, staffGroupSet],
      groups_upserted: allGroups,
      deleted_group_ids: [],
    })
  }

  async normalizeGroupName(name: string): Promise<Result<string, AppError>> {
    return this.ok(
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
  }

  async previewGroupSelection(
    roster: Roster,
    groupSetId: string,
    groupSelection: GroupSelectionMode,
  ): Promise<Result<GroupSelectionPreview, AppError>> {
    const gs = roster.group_sets.find((s) => s.id === groupSetId)
    if (!gs) {
      return this.ok({
        valid: true,
        error: null,
        group_ids: [],
        empty_group_ids: [],
        group_member_counts: [],
        total_groups: 0,
        matched_groups: 0,
      })
    }

    const groupMap = new Map(roster.groups.map((g) => [g.id, g]))
    let matchedIds = [...gs.group_ids]

    if (groupSelection.kind === "pattern") {
      const pattern = groupSelection.pattern.toLowerCase()
      matchedIds = matchedIds.filter((gid) => {
        const g = groupMap.get(gid)
        return g ? g.name.toLowerCase().includes(pattern) : false
      })
    }

    const matchedCount = matchedIds.length
    const excluded = new Set(groupSelection.excluded_group_ids)
    const finalIds = matchedIds.filter((gid) => !excluded.has(gid))

    const emptyIds = finalIds.filter((gid) => {
      const g = groupMap.get(gid)
      return !g || g.member_ids.length === 0
    })

    const counts = finalIds.map((gid) => ({
      group_id: gid,
      member_count: groupMap.get(gid)?.member_ids.length ?? 0,
    }))

    return this.ok({
      valid: true,
      error: null,
      group_ids: finalIds,
      empty_group_ids: emptyIds,
      group_member_counts: counts,
      total_groups: gs.group_ids.length,
      matched_groups: matchedCount,
    })
  }

  async filterByPattern(
    pattern: string,
    values: string[],
  ): Promise<Result<PatternFilterResult, AppError>> {
    if (!pattern.trim()) {
      return this.ok({
        valid: true,
        error: null,
        matched_indexes: values.map((_, i) => i),
        matched_count: values.length,
      })
    }

    const lowerPattern = pattern.toLowerCase()
    const matched: number[] = []
    for (let i = 0; i < values.length; i++) {
      if (values[i].toLowerCase().includes(lowerPattern)) {
        matched.push(i)
      }
    }

    return this.ok({
      valid: true,
      error: null,
      matched_indexes: matched,
      matched_count: matched.length,
    })
  }

  async previewImportGroupSet(
    _roster: Roster,
    _filePath: string,
  ): Promise<Result<GroupSetImportPreview, AppError>> {
    return this.ok({
      mode: "import",
      groups: [
        { name: "Group A", member_count: 3 },
        { name: "Group B", member_count: 3 },
      ],
      missing_members: [],
      total_missing: 0,
    })
  }

  async importGroupSet(
    _roster: Roster,
    _filePath: string,
  ): Promise<Result<GroupSetImportResult, AppError>> {
    const gsId = `imported-${Date.now()}`
    return this.ok({
      mode: "import",
      group_set: {
        id: gsId,
        name: "Imported Set",
        group_ids: [],
        connection: {
          kind: "import",
          source_filename: _filePath.split("/").pop() ?? _filePath,
          last_updated: nowIso(),
        },
        group_selection: { kind: "all", excluded_group_ids: [] },
      },
      groups_upserted: [],
      deleted_group_ids: [],
      missing_members: [],
      total_missing: 0,
    })
  }

  async previewReimportGroupSet(
    _roster: Roster,
    _groupSetId: string,
    _filePath: string,
  ): Promise<Result<GroupSetImportPreview, AppError>> {
    return this.ok({
      mode: "reimport",
      groups: [
        { name: "Group A", member_count: 3 },
        { name: "Group B", member_count: 3 },
      ],
      missing_members: [],
      total_missing: 0,
      added_group_names: [],
      removed_group_names: [],
      updated_group_names: [],
      renamed_groups: [],
    })
  }

  async reimportGroupSet(
    _roster: Roster,
    groupSetId: string,
    _filePath: string,
  ): Promise<Result<GroupSetImportResult, AppError>> {
    return this.ok({
      mode: "reimport",
      group_set: {
        id: groupSetId,
        name: "Reimported Set",
        group_ids: [],
        connection: {
          kind: "import",
          source_filename: _filePath.split("/").pop() ?? _filePath,
          last_updated: nowIso(),
        },
        group_selection: { kind: "all", excluded_group_ids: [] },
      },
      groups_upserted: [],
      deleted_group_ids: [],
      missing_members: [],
      total_missing: 0,
    })
  }

  async exportGroupSet(
    _roster: Roster,
    _groupSetId: string,
    filePath: string,
  ): Promise<Result<string, AppError>> {
    return this.ok(filePath)
  }

  async normalizeContext(
    lmsType: LmsType,
    baseUrl: string,
    courseId: string,
  ): Promise<Result<LmsContextKey, AppError>> {
    return this.ok({
      lms_type: lmsType,
      base_url: baseUrl.replace(/\/+$/, "").toLowerCase(),
      course_id: courseId.trim(),
    })
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

  async loadProfileSettings(
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
    this.rosters.set(name, createRoster("cs101"))
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

  async exportGroupsForEdit(
    _: Roster,
    __: AssignmentId,
    ___: string,
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
    const groups = resolveAssignmentGroups(roster, assignmentId)
    return this.ok({
      collisions: [],
      ready_count: groups.length,
    })
  }

  async preflightCloneRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: CloneConfig,
  ): Promise<Result<RepoPreflightResult, AppError>> {
    const groups = resolveAssignmentGroups(roster, assignmentId)
    return this.ok({
      collisions: [],
      ready_count: groups.length,
    })
  }

  async preflightDeleteRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: DeleteConfig,
  ): Promise<Result<RepoPreflightResult, AppError>> {
    const groups = resolveAssignmentGroups(roster, assignmentId)
    return this.ok({
      collisions: [],
      ready_count: groups.length,
    })
  }

  async createRepos(
    _: RepoOperationContext,
    roster: Roster,
    assignmentId: AssignmentId,
    __: CreateConfig,
  ): Promise<Result<OperationResult, AppError>> {
    const groups = resolveAssignmentGroups(roster, assignmentId)
    return this.ok({
      succeeded: groups.length,
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
    const groups = resolveAssignmentGroups(roster, assignmentId)
    return this.ok({
      succeeded: groups.length,
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
    const groups = resolveAssignmentGroups(roster, assignmentId)
    return this.ok({
      succeeded: groups.length,
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
