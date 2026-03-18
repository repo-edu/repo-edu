import type {
  AppError,
  DiagnosticOutput,
  GroupSetConnectFromLmsInput,
  GroupSetExportInput,
  GroupSetFetchAvailableFromLmsInput,
  GroupSetPreviewImportFromFileInput,
  GroupSetPreviewReimportFromFileInput,
  GroupSetSyncFromLmsInput,
  MilestoneProgress,
  VerifyLmsDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { PersistedCourse, RepoTeam } from "@repo-edu/domain"
import {
  exportGroupSetRows,
  exportRepoTeams,
  ORIGIN_LMS,
  previewImportGroupSet,
  previewReimportGroupSet,
} from "@repo-edu/domain"
import type {
  UserFilePort,
  UserFileText,
} from "@repo-edu/host-runtime-contract"
import type {
  LmsClient,
  LmsFetchedGroupSet,
} from "@repo-edu/integrations-lms-contract"
import { parseCsv, serializeCsv } from "./adapters/tabular/index.js"
import { createValidationAppError } from "./core.js"
import {
  inferFileFormat,
  isSharedAppError,
  normalizeProviderError,
  normalizeUserFileError,
  parseGroupSetImportRows,
  resolveAppSettingsSnapshot,
  resolveCourseSnapshot,
  resolveLmsDraft,
  throwIfAborted,
} from "./workflow-helpers.js"

const groupSetExportHeaders = [
  "group_set_id",
  "group_id",
  "group_name",
  "name",
  "email",
] as const

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
  if (connection?.kind === "canvas") return connection.groupSetId
  if (connection?.kind === "moodle") return connection.groupingId
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
