import { selectionModeAll } from "./group-set.js"
import {
  generateEntityId,
  normalizeEmail,
  normalizeOptionalString,
} from "./roster.js"
import type {
  Group,
  GroupOrigin,
  GroupSelectionMode,
  GroupSetConnection,
  GroupSetExportRow,
  GroupSetImportMissingMember,
  GroupSetImportPreview,
  GroupSetImportResult,
  GroupSetImportRow,
  GroupSetImportSource,
  GroupSetRenamedGroup,
  RepoTeam,
  Roster,
  RosterMember,
  ValidationResult,
} from "./types.js"

const ORIGIN_LOCAL: GroupOrigin = "local"

// ---------------------------------------------------------------------------
// Shared validation helper
// ---------------------------------------------------------------------------

export function importValidationError<T>(
  path: string,
  message: string,
): ValidationResult<T> {
  return {
    ok: false,
    issues: [{ path, message }],
  }
}

// ---------------------------------------------------------------------------
// Private types
// ---------------------------------------------------------------------------

type ParsedGroupSetImportRow = {
  groupId: string | null
  groupName: string
  email: string | null
}

type ParsedGroupSetImportGroup = {
  groupId: string | null
  name: string
  memberEmails: string[]
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function parseGroupSetImportRows(
  rows: readonly GroupSetImportRow[],
): ValidationResult<ParsedGroupSetImportGroup[]> {
  if (rows.length === 0) {
    return importValidationError("$", "CSV file has no data rows")
  }

  const parsedRows: ParsedGroupSetImportRow[] = []
  for (const [index, row] of rows.entries()) {
    const groupName = row.group_name.trim()
    if (groupName.length === 0) {
      return importValidationError(
        `rows.${index}.group_name`,
        `Line ${index + 2}: empty group_name`,
      )
    }

    parsedRows.push({
      groupName,
      groupId: normalizeOptionalString(row.group_id),
      email: normalizeOptionalString(row.email)?.toLowerCase() ?? null,
    })
  }

  const idToName = new Map<string, string>()
  for (const row of parsedRows) {
    if (row.groupId === null) {
      continue
    }

    const existingName = idToName.get(row.groupId)
    if (existingName !== undefined && existingName !== row.groupName) {
      return importValidationError(
        "rows",
        `group_id '${row.groupId}' maps to multiple group names: '${existingName}' and '${row.groupName}'`,
      )
    }
    idToName.set(row.groupId, row.groupName)
  }

  const groupOrder: string[] = []
  const groupsByName = new Map<string, ParsedGroupSetImportGroup>()
  const seenMemberships = new Set<string>()

  for (const row of parsedRows) {
    let group = groupsByName.get(row.groupName)
    if (group === undefined) {
      group = {
        groupId: row.groupId,
        name: row.groupName,
        memberEmails: [],
      }
      groupsByName.set(row.groupName, group)
      groupOrder.push(row.groupName)
    } else if (group.groupId === null && row.groupId !== null) {
      group.groupId = row.groupId
    }

    if (row.email === null) {
      continue
    }

    const membershipKey = `${row.groupName}\u0000${row.email}`
    if (seenMemberships.has(membershipKey)) {
      return importValidationError(
        "rows",
        `Duplicate membership: group '${row.groupName}', email '${row.email}'`,
      )
    }
    seenMemberships.add(membershipKey)
    group.memberEmails.push(row.email)
  }

  const groups: ParsedGroupSetImportGroup[] = []
  for (const groupName of groupOrder) {
    const group = groupsByName.get(groupName)
    if (group !== undefined) {
      groups.push(group)
    }
  }

  return {
    ok: true,
    value: groups,
  }
}

function buildRosterEmailIndex(roster: Roster): Map<string, string | null> {
  const index = new Map<string, string | null>()
  for (const member of roster.students.concat(roster.staff)) {
    const key = normalizeEmail(member.email)
    if (key.length === 0) {
      continue
    }
    if (index.has(key)) {
      index.set(key, null)
      continue
    }
    index.set(key, member.id)
  }
  return index
}

function resolveGroupMemberIds(
  emails: readonly string[],
  emailIndex: ReadonlyMap<string, string | null>,
): string[] {
  const seen = new Set<string>()
  const memberIds: string[] = []

  for (const email of emails) {
    const memberId = emailIndex.get(email)
    if (memberId === null || memberId === undefined || seen.has(memberId)) {
      continue
    }
    seen.add(memberId)
    memberIds.push(memberId)
  }

  return memberIds
}

function summarizeMissingMembers(
  groups: readonly ParsedGroupSetImportGroup[],
  emailIndex: ReadonlyMap<string, string | null>,
): { missingMembers: GroupSetImportMissingMember[]; totalMissing: number } {
  const missingMembers: GroupSetImportMissingMember[] = []
  let totalMissing = 0

  for (const group of groups) {
    let groupMissing = 0
    for (const email of group.memberEmails) {
      const matchedId = emailIndex.get(email)
      if (matchedId === null || matchedId === undefined) {
        groupMissing += 1
        totalMissing += 1
      }
    }

    if (groupMissing > 0) {
      missingMembers.push({
        groupName: group.name,
        missingCount: groupMissing,
      })
    }
  }

  return { missingMembers, totalMissing }
}

function cloneGroupSelectionMode(
  selection: GroupSelectionMode,
): GroupSelectionMode {
  if (selection.kind === "all") {
    return {
      kind: "all",
      excludedGroupIds: [...selection.excludedGroupIds],
    }
  }
  return {
    kind: "pattern",
    pattern: selection.pattern,
    excludedGroupIds: [...selection.excludedGroupIds],
  }
}

function createImportConnection(
  source: GroupSetImportSource,
): GroupSetConnection {
  return {
    kind: "import",
    sourceFilename: source.sourceFilename,
    sourcePath: source.sourcePath ?? null,
    lastUpdated: source.lastUpdated ?? new Date().toISOString(),
  }
}

function compareMembershipSets(
  currentMemberIds: readonly string[],
  nextMemberIds: readonly string[],
): boolean {
  if (currentMemberIds.length !== nextMemberIds.length) {
    return false
  }

  const currentSet = new Set(currentMemberIds)
  const nextSet = new Set(nextMemberIds)
  if (currentSet.size !== nextSet.size) {
    return false
  }

  for (const memberId of currentSet) {
    if (!nextSet.has(memberId)) {
      return false
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Import workflows
// ---------------------------------------------------------------------------

export function previewImportGroupSet(
  roster: Roster,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportPreview> {
  const parsed = parseGroupSetImportRows(rows)
  if (!parsed.ok) {
    return parsed
  }

  const emailIndex = buildRosterEmailIndex(roster)
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  )

  return {
    ok: true,
    value: {
      mode: "import",
      groups: parsed.value.map((group) => ({
        name: group.name,
        memberCount: resolveGroupMemberIds(group.memberEmails, emailIndex)
          .length,
      })),
      missingMembers,
      totalMissing,
    },
  }
}

export function importGroupSet(
  roster: Roster,
  source: GroupSetImportSource,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportResult> {
  const parsed = parseGroupSetImportRows(rows)
  if (!parsed.ok) {
    return parsed
  }

  const emailIndex = buildRosterEmailIndex(roster)
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  )

  const groupsUpserted: Group[] = parsed.value.map((parsedGroup) => ({
    id: generateEntityId("group"),
    name: parsedGroup.name,
    memberIds: resolveGroupMemberIds(parsedGroup.memberEmails, emailIndex),
    origin: ORIGIN_LOCAL,
    lmsGroupId: null,
  }))

  return {
    ok: true,
    value: {
      mode: "import",
      groupSet: {
        id: generateEntityId("group_set"),
        name: source.sourceFilename,
        groupIds: groupsUpserted.map((group) => group.id),
        connection: createImportConnection(source),
        groupSelection: selectionModeAll(),
        repoNameTemplate: null,
      },
      groupsUpserted,
      deletedGroupIds: [],
      missingMembers,
      totalMissing,
    },
  }
}

export function previewReimportGroupSet(
  roster: Roster,
  groupSetId: string,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportPreview> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found")
  }

  const parsed = parseGroupSetImportRows(rows)
  if (!parsed.ok) {
    return parsed
  }

  const emailIndex = buildRosterEmailIndex(roster)
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  )

  const existingGroups = groupSet.groupIds
    .map((groupId) =>
      roster.groups.find((candidate) => candidate.id === groupId),
    )
    .filter((group): group is Group => group !== undefined)
  const existingByName = new Map<string, Group>()
  const existingById = new Map<string, Group>()
  for (const group of existingGroups) {
    if (!existingByName.has(group.name)) {
      existingByName.set(group.name, group)
    }
    existingById.set(group.id, group)
  }

  const matchedExistingIds = new Set<string>()
  const addedGroupNames: string[] = []
  const updatedGroupNames: string[] = []
  const renamedGroups: GroupSetRenamedGroup[] = []

  for (const parsedGroup of parsed.value) {
    const matched =
      (parsedGroup.groupId === null
        ? undefined
        : existingById.get(parsedGroup.groupId)) ??
      existingByName.get(parsedGroup.name)

    if (matched === undefined) {
      addedGroupNames.push(parsedGroup.name)
      continue
    }

    matchedExistingIds.add(matched.id)
    if (matched.name !== parsedGroup.name) {
      renamedGroups.push({
        from: matched.name,
        to: parsedGroup.name,
      })
    }

    const nextMemberIds = resolveGroupMemberIds(
      parsedGroup.memberEmails,
      emailIndex,
    )
    if (!compareMembershipSets(matched.memberIds, nextMemberIds)) {
      updatedGroupNames.push(parsedGroup.name)
    }
  }

  const removedGroupNames = existingGroups
    .filter((group) => !matchedExistingIds.has(group.id))
    .map((group) => group.name)

  return {
    ok: true,
    value: {
      mode: "reimport",
      groups: parsed.value.map((group) => ({
        name: group.name,
        memberCount: resolveGroupMemberIds(group.memberEmails, emailIndex)
          .length,
      })),
      missingMembers,
      totalMissing,
      addedGroupNames,
      removedGroupNames,
      updatedGroupNames,
      renamedGroups,
    },
  }
}

export function reimportGroupSet(
  roster: Roster,
  groupSetId: string,
  source: GroupSetImportSource,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportResult> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found")
  }

  const parsed = parseGroupSetImportRows(rows)
  if (!parsed.ok) {
    return parsed
  }

  const emailIndex = buildRosterEmailIndex(roster)
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  )

  const existingGroups = groupSet.groupIds
    .map((groupId) =>
      roster.groups.find((candidate) => candidate.id === groupId),
    )
    .filter((group): group is Group => group !== undefined)
  const existingByName = new Map<string, Group>()
  const existingById = new Map<string, Group>()
  for (const group of existingGroups) {
    if (!existingByName.has(group.name)) {
      existingByName.set(group.name, group)
    }
    existingById.set(group.id, group)
  }

  const matchedExistingIds = new Set<string>()
  const nextGroupIds: string[] = []
  const groupsUpserted: Group[] = []

  for (const parsedGroup of parsed.value) {
    const nextMemberIds = resolveGroupMemberIds(
      parsedGroup.memberEmails,
      emailIndex,
    )
    const matched =
      (parsedGroup.groupId === null
        ? undefined
        : existingById.get(parsedGroup.groupId)) ??
      existingByName.get(parsedGroup.name)

    if (matched !== undefined) {
      matchedExistingIds.add(matched.id)
      const updatedGroup: Group = {
        ...matched,
        name: parsedGroup.name,
        memberIds: nextMemberIds,
      }
      nextGroupIds.push(updatedGroup.id)
      groupsUpserted.push(updatedGroup)
      continue
    }

    const createdGroup: Group = {
      id: generateEntityId("group"),
      name: parsedGroup.name,
      memberIds: nextMemberIds,
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }
    nextGroupIds.push(createdGroup.id)
    groupsUpserted.push(createdGroup)
  }

  return {
    ok: true,
    value: {
      mode: "reimport",
      groupSet: {
        ...groupSet,
        groupIds: nextGroupIds,
        connection: createImportConnection(source),
        groupSelection: cloneGroupSelectionMode(groupSet.groupSelection),
      },
      groupsUpserted,
      deletedGroupIds: existingGroups
        .filter((group) => !matchedExistingIds.has(group.id))
        .map((group) => group.id),
      missingMembers,
      totalMissing,
    },
  }
}

// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------

export function exportGroupSetRows(
  roster: Roster,
  groupSetId: string,
): ValidationResult<GroupSetExportRow[]> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found")
  }

  const memberById = new Map<string, RosterMember>()
  for (const member of roster.students.concat(roster.staff)) {
    memberById.set(member.id, member)
  }

  const rows: GroupSetExportRow[] = []
  for (const groupId of groupSet.groupIds) {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    if (group === undefined) {
      continue
    }

    if (group.memberIds.length === 0) {
      rows.push({
        group_set_id: groupSet.id,
        group_id: group.id,
        group_name: group.name,
        name: "",
        email: "",
      })
      continue
    }

    for (const memberId of group.memberIds) {
      const member = memberById.get(memberId)
      rows.push({
        group_set_id: groupSet.id,
        group_id: group.id,
        group_name: group.name,
        name: member?.name ?? "",
        email: member?.email ?? "",
      })
    }
  }

  return {
    ok: true,
    value: rows,
  }
}

export function exportRepoTeams(
  roster: Roster,
  groupSetId: string,
): ValidationResult<RepoTeam[]> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found")
  }

  const memberById = new Map<string, RosterMember>()
  for (const member of roster.students.concat(roster.staff)) {
    memberById.set(member.id, member)
  }

  const teams: RepoTeam[] = []
  for (const groupId of groupSet.groupIds) {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    if (group === undefined) continue

    const members = group.memberIds
      .map((id) => memberById.get(id))
      .filter(
        (m): m is RosterMember => m !== undefined && m.status === "active",
      )
      .map((m) => m.email)
      .filter((email) => email !== "")

    teams.push({ members, name: group.name })
  }

  teams.sort((a, b) => a.name.localeCompare(b.name))

  return { ok: true, value: teams }
}
