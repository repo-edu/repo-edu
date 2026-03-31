import { allocateGroupId, allocateGroupSetId } from "./id-allocator.js"
import { generateUniqueGroupName } from "./roster.js"
import type {
  Group,
  GroupOrigin,
  GroupSelectionMode,
  GroupSet,
  GroupSetConnection,
  IdSequences,
  ResolvedGitUsername,
  ResolveGitUsernamesResult,
  Roster,
  SystemGroupSetEnsureResult,
} from "./types.js"

const SYSTEM_TYPE_INDIVIDUAL_STUDENTS = "individual_students" as const
const SYSTEM_TYPE_STAFF = "staff" as const
const STAFF_GROUP_NAME = "staff" as const
const ORIGIN_SYSTEM: GroupOrigin = "system"

export function selectionModeAll(): GroupSelectionMode {
  return {
    kind: "all",
    excludedGroupIds: [],
  }
}

export function selectionModePattern(pattern: string): GroupSelectionMode {
  return {
    kind: "pattern",
    pattern,
    excludedGroupIds: [],
  }
}

function isSystemSet(groupSet: GroupSet, systemType: string): boolean {
  return (
    groupSet.connection?.kind === "system" &&
    groupSet.connection.systemType === systemType
  )
}

function createSystemConnection(systemType: string): GroupSetConnection {
  return {
    kind: "system",
    systemType,
  }
}

export function findSystemSet(
  roster: Roster,
  systemType: string,
): GroupSet | null {
  return (
    roster.groupSets.find((groupSet) => isSystemSet(groupSet, systemType)) ??
    null
  )
}

export function systemSetsMissing(roster: Roster): boolean {
  return (
    findSystemSet(roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS) === null ||
    findSystemSet(roster, SYSTEM_TYPE_STAFF) === null
  )
}

function ensureIndividualStudentsSet(
  roster: Roster,
  sequences: IdSequences,
): {
  groupSet: GroupSet
  groupsUpserted: Group[]
  deletedGroupIds: string[]
  sequences: IdSequences
} {
  const groupsUpserted: Group[] = []
  const deletedGroupIds: string[] = []
  let seq = sequences

  let setIndex = roster.groupSets.findIndex((groupSet) =>
    isSystemSet(groupSet, SYSTEM_TYPE_INDIVIDUAL_STUDENTS),
  )
  if (setIndex < 0) {
    const alloc = allocateGroupSetId(seq)
    seq = alloc.sequences
    roster.groupSets.push({
      id: alloc.id,
      name: "Individual Students",
      groupIds: [],
      connection: createSystemConnection(SYSTEM_TYPE_INDIVIDUAL_STUDENTS),
      groupSelection: selectionModeAll(),
      repoNameTemplate: "{group}",
    })
    setIndex = roster.groupSets.length - 1
  }

  const activeStudents = roster.students.filter(
    (student) => student.status === "active",
  )
  const setGroupIds = new Set(roster.groupSets[setIndex].groupIds)

  const existingByMember = new Map<string, number>()
  roster.groups.forEach((group, index) => {
    if (
      group.origin === ORIGIN_SYSTEM &&
      group.memberIds.length === 1 &&
      setGroupIds.has(group.id)
    ) {
      const memberId = group.memberIds[0]
      if (memberId !== undefined) {
        existingByMember.set(memberId, index)
      }
    }
  })

  const existingNames = new Set(
    roster.groups
      .filter((group) => setGroupIds.has(group.id))
      .map((group) => group.name),
  )
  const neededGroupIds: string[] = []
  const neededGroupIdSet = new Set<string>()

  for (const student of activeStudents) {
    const existingIndex = existingByMember.get(student.id)
    if (existingIndex !== undefined) {
      const group = roster.groups[existingIndex]
      existingNames.delete(group.name)
      const expectedName = generateUniqueGroupName([student], existingNames)
      if (group.name !== expectedName) {
        group.name = expectedName
        groupsUpserted.push({ ...group })
      }
      existingNames.add(expectedName)
      neededGroupIds.push(group.id)
      neededGroupIdSet.add(group.id)
      continue
    }

    const alloc = allocateGroupId(seq)
    seq = alloc.sequences
    const newGroup: Group = {
      id: alloc.id,
      name: generateUniqueGroupName([student], existingNames),
      memberIds: [student.id],
      origin: ORIGIN_SYSTEM,
      lmsGroupId: null,
    }
    existingNames.add(newGroup.name)
    roster.groups.push(newGroup)
    groupsUpserted.push({ ...newGroup })
    neededGroupIds.push(newGroup.id)
    neededGroupIdSet.add(newGroup.id)
  }

  const previousGroupIds = [...roster.groupSets[setIndex].groupIds]
  for (const groupId of previousGroupIds) {
    if (neededGroupIdSet.has(groupId)) {
      continue
    }

    const removedIndex = roster.groups.findIndex(
      (group) => group.id === groupId,
    )
    if (removedIndex < 0) {
      continue
    }

    const [removedGroup] = roster.groups.splice(removedIndex, 1)
    deletedGroupIds.push(removedGroup.id)
    for (const groupSet of roster.groupSets) {
      groupSet.groupIds = groupSet.groupIds.filter(
        (candidate) => candidate !== removedGroup.id,
      )
    }
  }

  roster.groupSets[setIndex].groupIds = neededGroupIds

  return {
    groupSet: { ...roster.groupSets[setIndex] },
    groupsUpserted,
    deletedGroupIds,
    sequences: seq,
  }
}

function ensureStaffSet(
  roster: Roster,
  sequences: IdSequences,
): {
  groupSet: GroupSet
  groupsUpserted: Group[]
  deletedGroupIds: string[]
  sequences: IdSequences
} {
  const groupsUpserted: Group[] = []
  let seq = sequences

  let setIndex = roster.groupSets.findIndex((groupSet) =>
    isSystemSet(groupSet, SYSTEM_TYPE_STAFF),
  )
  if (setIndex < 0) {
    const alloc = allocateGroupSetId(seq)
    seq = alloc.sequences
    roster.groupSets.push({
      id: alloc.id,
      name: "Staff",
      groupIds: [],
      connection: createSystemConnection(SYSTEM_TYPE_STAFF),
      groupSelection: selectionModeAll(),
      repoNameTemplate: null,
    })
    setIndex = roster.groupSets.length - 1
  }

  const activeStaffIds = roster.staff
    .filter((member) => member.status === "active")
    .map((member) => member.id)

  const setGroupIds = new Set(roster.groupSets[setIndex].groupIds)
  const existingGroup = roster.groups.find(
    (group) =>
      group.origin === ORIGIN_SYSTEM &&
      group.name.toLowerCase() === STAFF_GROUP_NAME &&
      setGroupIds.has(group.id),
  )

  if (existingGroup !== undefined) {
    const nameChanged = existingGroup.name !== STAFF_GROUP_NAME
    if (nameChanged) {
      existingGroup.name = STAFF_GROUP_NAME
    }
    const membershipChanged =
      existingGroup.memberIds.length !== activeStaffIds.length ||
      existingGroup.memberIds.some(
        (memberId, index) => memberId !== activeStaffIds[index],
      )
    if (nameChanged || membershipChanged) {
      existingGroup.memberIds = [...activeStaffIds]
      groupsUpserted.push({ ...existingGroup })
    }
  } else {
    const alloc = allocateGroupId(seq)
    seq = alloc.sequences
    const newGroup: Group = {
      id: alloc.id,
      name: STAFF_GROUP_NAME,
      memberIds: [...activeStaffIds],
      origin: ORIGIN_SYSTEM,
      lmsGroupId: null,
    }
    roster.groups.push(newGroup)
    roster.groupSets[setIndex].groupIds = [
      ...roster.groupSets[setIndex].groupIds,
      newGroup.id,
    ]
    groupsUpserted.push({ ...newGroup })
  }

  return {
    groupSet: { ...roster.groupSets[setIndex] },
    groupsUpserted,
    deletedGroupIds: [],
    sequences: seq,
  }
}

export function ensureSystemGroupSets(
  roster: Roster,
  sequences: IdSequences,
): SystemGroupSetEnsureResult {
  const individualStudents = ensureIndividualStudentsSet(roster, sequences)
  const staff = ensureStaffSet(roster, individualStudents.sequences)

  return {
    groupSets: [individualStudents.groupSet, staff.groupSet],
    groupsUpserted: [
      ...individualStudents.groupsUpserted,
      ...staff.groupsUpserted,
    ],
    deletedGroupIds: [
      ...individualStudents.deletedGroupIds,
      ...staff.deletedGroupIds,
    ],
    idSequences: staff.sequences,
  }
}

export function activeMemberIds(roster: Roster, group: Group): string[] {
  const activeIds = new Set(
    roster.students
      .concat(roster.staff)
      .filter((member) => member.status === "active")
      .map((member) => member.id),
  )

  return group.memberIds.filter((memberId) => activeIds.has(memberId))
}

export function resolveGitUsernames(
  roster: Roster,
  memberIds: readonly string[],
): ResolveGitUsernamesResult {
  const memberById = new Map(
    roster.students.concat(roster.staff).map((member) => [member.id, member]),
  )
  const resolved: ResolvedGitUsername[] = []
  const missing: string[] = []
  const seen = new Set<string>()

  for (const memberId of memberIds) {
    if (seen.has(memberId)) {
      continue
    }
    seen.add(memberId)

    const member = memberById.get(memberId)
    if (member === undefined) {
      missing.push(memberId)
      continue
    }

    const gitUsername = (member.gitUsername ?? "").trim()
    if (gitUsername === "") {
      missing.push(memberId)
      continue
    }

    resolved.push({
      memberId,
      gitUsername,
    })
  }

  return {
    resolved,
    missing,
  }
}
