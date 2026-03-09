import {
  packageId as contractPackageId,
  createCancelledAppError,
  isAppError,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  packageId as domainPackageId,
  ensureSystemGroupSets,
  exportGroupSetRows,
  formatSmokeWorkflowMessage,
  gitUsernameImportRowSchema,
  groupSetExportHeaders,
  groupSetImportRowSchema,
  normalizeRoster,
  ORIGIN_LMS,
  planRepositoryOperation,
  previewImportGroupSet,
  previewReimportGroupSet,
  studentImportRowSchema,
  validateAssignment,
  validateAssignmentWithTemplate,
  validatePersistedAppSettings,
  validatePersistedProfile,
  validateRoster,
} from "@repo-edu/domain"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
import { packageId as gitContractPackageId } from "@repo-edu/integrations-git-contract"
import { packageId as lmsContractPackageId } from "@repo-edu/integrations-lms-contract"
import { parseCsv, serializeCsv } from "./adapters/tabular/index.js"
export const packageId = "@repo-edu/application"
export const workspaceDependencies = [
  contractPackageId,
  domainPackageId,
  hostRuntimePackageId,
  gitContractPackageId,
  lmsContractPackageId,
]
export async function runSmokeWorkflow(source) {
  return {
    workflowId: "phase-1.docs.smoke",
    message: formatSmokeWorkflowMessage(source),
    packageLine: [packageId, contractPackageId, domainPackageId].join(" -> "),
    executedAt: new Date().toISOString(),
  }
}
export function createValidationAppError(message, issues) {
  return {
    type: "validation",
    message,
    issues,
  }
}
export function runValidateRosterForProfile(profile) {
  return validateRoster(profile.roster)
}
export function runValidateAssignmentForProfile(
  profile,
  assignmentId,
  options,
) {
  if (options?.repoNameTemplate !== undefined) {
    return validateAssignmentWithTemplate(
      profile.roster,
      assignmentId,
      options.identityMode ?? "username",
      options.repoNameTemplate,
    )
  }
  return validateAssignment(
    profile.roster,
    assignmentId,
    options?.identityMode ?? "username",
  )
}
export function createInMemoryProfileStore(profiles) {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
  return {
    listProfiles() {
      return [...profilesById.values()]
    },
    loadProfile(profileId) {
      return profilesById.get(profileId) ?? null
    },
    saveProfile(profile) {
      profilesById.set(profile.id, profile)
      return profile
    },
    deleteProfile(profileId) {
      profilesById.delete(profileId)
    },
  }
}
export function createInMemoryAppSettingsStore(settings = null) {
  let value = settings
  return {
    loadSettings() {
      return value
    },
    saveSettings(nextSettings) {
      value = nextSettings
      return nextSettings
    },
  }
}
function summarizeProfile(profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    updatedAt: profile.updatedAt,
  }
}
function sortProfilesByUpdatedAt(profiles) {
  return [...profiles].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}
function validateLoadedProfile(profile) {
  const validation = validatePersistedProfile(profile)
  if (!validation.ok) {
    throw createValidationAppError(
      "Loaded profile validation failed.",
      validation.issues,
    )
  }
  return validation.value
}
async function loadRequiredProfile(profileStore, profileId, signal) {
  throwIfAborted(signal)
  const profile = await profileStore.loadProfile(profileId, signal)
  throwIfAborted(signal)
  if (profile !== null) {
    return validateLoadedProfile(profile)
  }
  throw {
    type: "not-found",
    message: `Profile '${profileId}' was not found.`,
    resource: "profile",
  }
}
async function loadSettingsOrDefault(appSettingsStore, signal) {
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
export function createProfileWorkflowHandlers(profileStore) {
  return {
    "profile.list": async (_input, options) => {
      throwIfAborted(options?.signal)
      const profiles = await profileStore.listProfiles(options?.signal)
      throwIfAborted(options?.signal)
      return sortProfilesByUpdatedAt(profiles)
        .map(validateLoadedProfile)
        .map(summarizeProfile)
    },
    "profile.load": async (input, options) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Resolving profile from profile store.",
      })
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      options?.onOutput?.({
        channel: "info",
        message: `Loaded profile ${profile.displayName}.`,
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Profile loaded.",
      })
      return profile
    },
    "profile.save": async (input, options) => {
      options?.onProgress?.({
        step: 1,
        totalSteps: 3,
        label: "Validating profile payload.",
      })
      const validation = validatePersistedProfile(input)
      if (!validation.ok) {
        throw createValidationAppError(
          "Profile validation failed.",
          validation.issues,
        )
      }
      const nextProfile = {
        ...validation.value,
        updatedAt: new Date().toISOString(),
      }
      options?.onOutput?.({
        channel: "info",
        message: `Saving profile ${nextProfile.displayName}.`,
      })
      options?.onProgress?.({
        step: 2,
        totalSteps: 3,
        label: "Writing profile to profile store.",
      })
      const savedProfile = await profileStore.saveProfile(
        nextProfile,
        options?.signal,
      )
      options?.onProgress?.({
        step: 3,
        totalSteps: 3,
        label: "Profile saved.",
      })
      return savedProfile
    },
    "profile.delete": async (input, options) => {
      throwIfAborted(options?.signal)
      await profileStore.deleteProfile(input.profileId, options?.signal)
    },
  }
}
export function createValidationWorkflowHandlers(profileStore) {
  return {
    "validation.roster": async (input, options) => {
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      return runValidateRosterForProfile(profile)
    },
    "validation.assignment": async (input, options) => {
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      return runValidateAssignmentForProfile(profile, input.assignmentId)
    },
  }
}
export function createSettingsWorkflowHandlers(appSettingsStore) {
  return {
    "settings.loadApp": async (_input, options) =>
      loadSettingsOrDefault(appSettingsStore, options?.signal),
    "settings.saveApp": async (input, options) => {
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
function normalizeProviderError(error, provider, operation) {
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
export function createConnectionWorkflowHandlers(ports) {
  return {
    "connection.verifyLmsDraft": async (input, options) => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LMS connection verification request.",
        })
        const draft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
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
    "connection.listLmsCoursesDraft": async (input, options) => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LMS course list request.",
        })
        const draft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
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
    "connection.verifyGitDraft": async (input, options) => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing Git connection verification request.",
        })
        const draft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
          organization: input.organization,
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
const studentExportHeaders = [
  "id",
  "name",
  "email",
  "student_number",
  "git_username",
  "status",
]
function inferFileFormat(file) {
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
function toStudentImportRow(row) {
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
  }
}
function parseStudentRows(rows) {
  const normalizedRows = []
  const issues = []
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
function parseGitUsernameRows(rows) {
  const normalizedRows = []
  const issues = []
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
function toGroupSetImportRow(row) {
  return {
    group_name: row.group_name ?? row.group ?? row.team ?? "",
    group_id: row.group_id ?? row.id,
    name: row.name ?? row.member_name ?? row.student_name,
    email: row.email ?? row.student_email,
  }
}
function parseGroupSetImportRows(rows) {
  const normalizedRows = []
  const issues = []
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
function rosterFromStudentRows(rows) {
  const roster = normalizeRoster(
    rows.map((row, index) => ({
      id: row.id ?? row.student_number ?? row.email ?? `imported-${index + 1}`,
      nameCandidates: [row.name],
      emailCandidates: row.email === undefined ? [] : [row.email],
      studentNumber: row.student_number,
      gitUsername: row.git_username,
      status: row.status,
      source: "import",
    })),
  )
  ensureSystemGroupSets(roster)
  return roster
}
function resolveLmsDraft(profile, settings) {
  if (profile.lmsConnectionName === null) {
    throw {
      type: "not-found",
      message: "Profile does not reference an LMS connection.",
      resource: "connection",
    }
  }
  const connection = settings.lmsConnections.find(
    (candidate) => candidate.name === profile.lmsConnectionName,
  )
  if (connection === undefined) {
    throw {
      type: "not-found",
      message: `LMS connection '${profile.lmsConnectionName}' was not found.`,
      resource: "connection",
    }
  }
  return {
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    token: connection.token,
  }
}
function resolveGitDraft(profile, settings) {
  if (profile.gitConnectionName === null) {
    return null
  }
  const connection = settings.gitConnections.find(
    (candidate) => candidate.name === profile.gitConnectionName,
  )
  if (connection === undefined) {
    throw {
      type: "not-found",
      message: `Git connection '${profile.gitConnectionName}' was not found.`,
      resource: "connection",
    }
  }
  return {
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    token: connection.token,
    organization: connection.organization,
  }
}
export function createRosterWorkflowHandlers(
  profileStore,
  appSettingsStore,
  ports,
) {
  return {
    "roster.importFromFile": async (input, options) => {
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
    "roster.importFromLms": async (input, options) => {
      const totalSteps = 4
      let providerForError = "canvas"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading profile and app settings.",
        })
        const profile = await loadRequiredProfile(
          profileStore,
          input.profileId,
          options?.signal,
        )
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        const draft = resolveLmsDraft(profile, settings)
        providerForError = draft.provider
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching roster from LMS provider.",
        })
        options?.onOutput?.({
          channel: "info",
          message: `Fetching roster from ${draft.provider} course ${input.courseId}.`,
        })
        const roster = await ports.lms.fetchRoster(
          draft,
          input.courseId,
          options?.signal,
        )
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Ensuring required system group sets.",
        })
        ensureSystemGroupSets(roster)
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "LMS roster import complete.",
        })
        return roster
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchRoster")
      }
    },
    "roster.exportStudents": async (input, options) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Loading profile for student export.",
      })
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      if (input.format !== "csv") {
        throw createValidationAppError(
          "Student export format is unsupported.",
          [
            {
              path: "format",
              message:
                "Only CSV export is supported by the current text-based file port.",
            },
          ],
        )
      }
      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Serializing student export payload.",
      })
      const exportRows = profile.roster.students.map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        student_number: student.studentNumber ?? "",
        git_username: student.gitUsername ?? "",
        status: student.status,
      }))
      const text = serializeCsv({
        headers: [...studentExportHeaders],
        rows: exportRows,
      })
      await ports.userFile.writeText(input.target, text, options?.signal)
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Student export written.",
      })
      options?.onOutput?.({
        channel: "info",
        message: `Exported ${exportRows.length} students to ${input.target.displayName}.`,
      })
      return { file: input.target }
    },
  }
}
function lmsGroupSetRemoteId(groupSetId, profile) {
  const groupSet = profile.roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    throw {
      type: "not-found",
      message: `Group set '${groupSetId}' was not found.`,
      resource: "group-set",
    }
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
function buildLmsMemberMap(profile) {
  const map = new Map()
  for (const member of profile.roster.students.concat(profile.roster.staff)) {
    map.set(member.id, member.id)
    if (member.lmsUserId !== null && member.lmsUserId !== "") {
      map.set(member.lmsUserId, member.id)
    }
  }
  return map
}
function resolveLmsGroupMembers(memberMap, memberIds) {
  const resolved = []
  const seen = new Set()
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
function escapeYamlScalar(value) {
  return `'${value.replace(/'/g, "''")}'`
}
function serializeGroupSetRowsAsYaml(rows) {
  if (rows.length === 0) {
    return "[]\n"
  }
  return rows
    .map(
      (row) =>
        `- group_set_id: ${escapeYamlScalar(row.group_set_id)}\n` +
        `  group_id: ${escapeYamlScalar(row.group_id)}\n` +
        `  group_name: ${escapeYamlScalar(row.group_name)}\n` +
        `  name: ${escapeYamlScalar(row.name)}\n` +
        `  email: ${escapeYamlScalar(row.email)}`,
    )
    .join("\n")
}
export function createGroupSetWorkflowHandlers(
  profileStore,
  appSettingsStore,
  ports,
) {
  return {
    "groupSet.fetchAvailableFromLms": async (input, options) => {
      const totalSteps = 3
      let providerForError = "canvas"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading profile and app settings.",
        })
        const profile = await loadRequiredProfile(
          profileStore,
          input.profileId,
          options?.signal,
        )
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        const draft = resolveLmsDraft(profile, settings)
        providerForError = draft.provider
        if (profile.courseId === null) {
          throw {
            type: "not-found",
            message: "Profile does not have a selected course.",
            resource: "course",
          }
        }
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching available LMS group sets.",
        })
        const available = await ports.lms.listGroupSets(
          draft,
          profile.courseId,
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
    "groupSet.syncFromLms": async (input, options) => {
      const totalSteps = 5
      let providerForError = "canvas"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading profile and app settings.",
        })
        const profile = await loadRequiredProfile(
          profileStore,
          input.profileId,
          options?.signal,
        )
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        const draft = resolveLmsDraft(profile, settings)
        providerForError = draft.provider
        if (profile.courseId === null) {
          throw {
            type: "not-found",
            message: "Profile does not have a selected course.",
            resource: "course",
          }
        }
        const remoteGroupSetId = lmsGroupSetRemoteId(input.groupSetId, profile)
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching LMS group set data.",
        })
        const fetched = await ports.lms.fetchGroupSet(
          draft,
          profile.courseId,
          remoteGroupSetId,
          options?.signal,
        )
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Applying LMS group-set patch to roster.",
        })
        const currentGroupSet = profile.roster.groupSets.find(
          (candidate) => candidate.id === input.groupSetId,
        )
        if (currentGroupSet === undefined) {
          throw {
            type: "not-found",
            message: `Group set '${input.groupSetId}' was not found.`,
            resource: "group-set",
          }
        }
        const currentSetGroupIds = new Set(currentGroupSet.groupIds)
        const existingByLmsGroupId = new Map()
        for (const group of profile.roster.groups) {
          if (!currentSetGroupIds.has(group.id) || group.lmsGroupId === null) {
            continue
          }
          existingByLmsGroupId.set(group.lmsGroupId, group)
        }
        const memberMap = buildLmsMemberMap(profile)
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
          profile.roster.groups.map((group) => [group.id, group]),
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
        const nextGroupSets = profile.roster.groupSets.map((groupSet) => {
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
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Saving synced group-set state to profile store.",
        })
        await profileStore.saveProfile(
          {
            ...profile,
            roster: {
              ...profile.roster,
              groups: [...groupsById.values()],
              groupSets: nextGroupSets,
            },
            updatedAt: new Date().toISOString(),
          },
          options?.signal,
        )
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "LMS group-set sync complete.",
        })
        return nextGroupSet
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchGroupSet")
      }
    },
    "groupSet.previewImportFromFile": async (input, options) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Loading profile for group-set import preview.",
      })
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set import file.",
      })
      let fileText
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
      const preview = previewImportGroupSet(profile.roster, parsedRows)
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
    "groupSet.previewReimportFromFile": async (input, options) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Loading profile for group-set reimport preview.",
      })
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set reimport file.",
      })
      let fileText
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
        profile.roster,
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
    "groupSet.export": async (input, options) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Loading profile and group set for export.",
      })
      const profile = await loadRequiredProfile(
        profileStore,
        input.profileId,
        options?.signal,
      )
      const exportedRows = exportGroupSetRows(profile.roster, input.groupSetId)
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
        case "yaml":
          serialized = serializeGroupSetRowsAsYaml(exportedRows.value)
          break
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
function normalizeImportedEmail(email) {
  return email.trim().toLowerCase()
}
export function createGitUsernameWorkflowHandlers(
  profileStore,
  appSettingsStore,
  ports,
) {
  return {
    "gitUsernames.import": async (input, options) => {
      const totalSteps = 5
      let providerForError = "github"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading active profile and app settings.",
        })
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        if (settings.activeProfileId === null) {
          throw {
            type: "not-found",
            message: "No active profile selected for Git username import.",
            resource: "profile",
          }
        }
        const profile = await loadRequiredProfile(
          profileStore,
          settings.activeProfileId,
          options?.signal,
        )
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
          ...profile.roster,
          students: profile.roster.students.map((student) => ({ ...student })),
          staff: profile.roster.staff.map((member) => ({ ...member })),
        }
        const studentIndexByEmail = new Map()
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
        const gitDraft = resolveGitDraft(profile, settings)
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
          const verificationByUsername = new Map(
            verificationResults.map((result) => [result.username, result]),
          )
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
        await profileStore.saveProfile(
          {
            ...profile,
            roster,
            updatedAt: new Date().toISOString(),
          },
          options?.signal,
        )
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
function collectRepositoryGroups(profile, assignmentId) {
  const assignmentIds =
    assignmentId === null
      ? profile.roster.assignments.map((assignment) => assignment.id)
      : [assignmentId]
  const plannedGroups = []
  for (const selectedAssignmentId of assignmentIds) {
    const plan = planRepositoryOperation(profile.roster, selectedAssignmentId)
    if (!plan.ok) {
      return plan
    }
    plannedGroups.push(...plan.value.groups)
  }
  return {
    ok: true,
    value: plannedGroups,
  }
}
function uniqueRepositoryNames(groups) {
  return Array.from(new Set(groups.map((group) => group.repoName)))
}
function normalizeDirectoryLayout(value) {
  if (value === "by-team" || value === "by-task") {
    return value
  }
  return "flat"
}
function normalizeTargetDirectory(value) {
  const normalized = value?.trim()
  return normalized === undefined || normalized === "" ? "." : normalized
}
function sanitizePathSegment(value) {
  const trimmed = value.trim()
  if (trimmed === "") {
    return "unnamed"
  }
  return trimmed.replace(/[\\/]/g, "_")
}
function joinPath(base, segment) {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  const normalizedBase = base.replace(/[\\/]+$/g, "")
  const normalizedSegment = segment.replace(/^[\\/]+/g, "")
  if (normalizedBase === "") {
    return normalizedSegment
  }
  return `${normalizedBase}${separator}${normalizedSegment}`
}
function repositoryCloneParentPath(targetDirectory, layout, group) {
  if (layout === "flat") {
    return targetDirectory
  }
  const folderName =
    layout === "by-team"
      ? sanitizePathSegment(group.groupName)
      : sanitizePathSegment(group.assignmentName)
  return joinPath(targetDirectory, folderName)
}
function repositoryClonePath(targetDirectory, layout, group) {
  return joinPath(
    repositoryCloneParentPath(targetDirectory, layout, group),
    sanitizePathSegment(group.repoName),
  )
}
function requireGitOrganization(gitDraft, operation) {
  if (gitDraft.organization === null || gitDraft.organization.trim() === "") {
    throw createValidationAppError(
      "Git connection is missing organization for repository workflows.",
      [
        {
          path: "gitConnection.organization",
          message: `Set an organization before running ${operation}.`,
        },
      ],
    )
  }
  return gitDraft.organization
}
function normalizeRepositoryExecutionError(error, operation) {
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
  profileStore,
  appSettingsStore,
  ports,
) {
  return {
    "repo.create": async (input, options) => {
      const totalSteps = 4
      let providerForError = "github"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading profile and app settings for repository create.",
        })
        const profile = await loadRequiredProfile(
          profileStore,
          input.profileId,
          options?.signal,
        )
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        const gitDraft = resolveGitDraft(profile, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Profile does not reference a Git connection.",
            resource: "connection",
          }
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(gitDraft, "repo.create")
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(profile, input.assignmentId)
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
    "repo.clone": async (input, options) => {
      const totalSteps = 5
      let providerForError = "github"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading profile and app settings for repository clone.",
        })
        const profile = await loadRequiredProfile(
          profileStore,
          input.profileId,
          options?.signal,
        )
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        const gitDraft = resolveGitDraft(profile, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Profile does not reference a Git connection.",
            resource: "connection",
          }
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(gitDraft, "repo.clone")
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(profile, input.assignmentId)
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
        const parentDirectories = new Set([targetDirectory])
        const cloneTargets = []
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
              kind: "ensure-directory",
              path,
            })),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "ensureDirectories")
        }
        let inspected = []
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
          let result
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
    "repo.delete": async (input, options) => {
      const totalSteps = 4
      let providerForError = "github"
      try {
        if (input.confirmDelete !== true) {
          throw createValidationAppError(
            "Repository delete requires explicit confirmation.",
            [
              {
                path: "confirmDelete",
                message: "Set confirmDelete=true to execute repo.delete.",
              },
            ],
          )
        }
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Loading profile and app settings for repository delete.",
        })
        const profile = await loadRequiredProfile(
          profileStore,
          input.profileId,
          options?.signal,
        )
        const settings = await loadSettingsOrDefault(
          appSettingsStore,
          options?.signal,
        )
        const gitDraft = resolveGitDraft(profile, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Profile does not reference a Git connection.",
            resource: "connection",
          }
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(gitDraft, "repo.delete")
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(profile, input.assignmentId)
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        const repositoryNames = uniqueRepositoryNames(planned.value)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Deleting repositories through Git provider client.",
        })
        const deleted = await ports.git.deleteRepositories(
          gitDraft,
          {
            organization,
            repositoryNames,
          },
          options?.signal,
        )
        options?.onOutput?.({
          channel: "info",
          message: `Repository delete summary: requested ${repositoryNames.length}, deleted ${deleted.deletedCount}, missing ${deleted.missing.length}.`,
        })
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Repository delete workflow complete.",
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
          "deleteRepositories",
        )
      }
    },
  }
}
function toCancelledAppError() {
  return createCancelledAppError()
}
function isSharedAppError(value) {
  return isAppError(value)
}
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw toCancelledAppError()
  }
}
function normalizeUserFileError(error, operation) {
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
export async function runInspectUserFileWorkflow(userFilePort, file, options) {
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
  userFilePort,
  target,
  options,
) {
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
]
function delay(ms, signal) {
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
export async function runSpikeWorkflow(options) {
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
]
export async function runSpikeCorsWorkflow(ports, options) {
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
