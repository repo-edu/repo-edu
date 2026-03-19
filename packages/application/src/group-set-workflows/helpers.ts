import type {
  AppError,
  VerifyLmsDraftInput,
} from "@repo-edu/application-contract"
import {
  ORIGIN_LMS,
  type PersistedCourse,
  type RepoTeam,
} from "@repo-edu/domain/types"
import type { LmsFetchedGroupSet } from "@repo-edu/integrations-lms-contract"
import { createValidationAppError } from "../core.js"

export const groupSetExportHeaders = [
  "group_set_id",
  "group_id",
  "group_name",
  "name",
  "email",
] as const

export function lmsGroupSetRemoteId(
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

export function generateLocalGroupSetId(course: PersistedCourse): string {
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

export function createConnectedGroupSet(
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

export function connectedRemoteId(
  connection: PersistedCourse["roster"]["groupSets"][number]["connection"],
): string | null {
  if (connection?.kind === "canvas") return connection.groupSetId
  if (connection?.kind === "moodle") return connection.groupingId
  return null
}

export function applyFetchedGroupSetToCourse(
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

export function serializeRepobeeYaml(teams: readonly RepoTeam[]): string {
  return teams
    .map((team) => `${team.name}:\n\tmembers:[${team.members.join(", ")}]`)
    .join("\n")
}
