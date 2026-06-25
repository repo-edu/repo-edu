import {
  allocateGroupId,
  allocateGroupIds,
  allocateGroupSetId,
} from "../id-allocator.js"
import type {
  Group,
  GroupOrigin,
  GroupSetImportMemberKey,
  GroupSetImportMissingMember,
  GroupSetImportPreview,
  GroupSetImportResult,
  GroupSetImportRow,
  GroupSetImportSource,
  IdSequences,
  NamedGroupSet,
  Roster,
  ValidationResult,
} from "../types.js"
import { initialIdSequences } from "../types.js"
import {
  buildMemberIndex,
  createImportConnection,
  findRosterGroup,
  type GroupSetImportOptions,
  importValidationError,
  normalizeName,
  normalizeOptionalString,
  resolveImportedGroupSetName,
  resolveNamedTargetGroupSet,
} from "./shared.js"

const ORIGIN_LOCAL: GroupOrigin = "local"

type ParsedGroupSetImportGroup = {
  name: string
  normalizedName: string
  memberKeys: string[]
}

function parseGroupSetImportRows(
  rows: readonly GroupSetImportRow[],
  memberKey: GroupSetImportMemberKey,
): ValidationResult<ParsedGroupSetImportGroup[]> {
  if (rows.length === 0) {
    return importValidationError("$", "CSV file has no data rows")
  }

  const groupOrder: string[] = []
  const groupsByNormalizedName = new Map<string, ParsedGroupSetImportGroup>()
  const seenMemberships = new Set<string>()

  for (const [index, row] of rows.entries()) {
    const rawGroupName = row.group_name.trim()
    if (rawGroupName.length === 0) {
      return importValidationError(
        `rows.${index}.group_name`,
        `Line ${index + 2}: empty group_name`,
      )
    }

    const normalizedGroupName = normalizeName(rawGroupName)
    let group = groupsByNormalizedName.get(normalizedGroupName)
    if (group === undefined) {
      group = {
        name: rawGroupName,
        normalizedName: normalizedGroupName,
        memberKeys: [],
      }
      groupsByNormalizedName.set(normalizedGroupName, group)
      groupOrder.push(normalizedGroupName)
    }

    const memberValue =
      memberKey === "email"
        ? (normalizeOptionalString(row.email)?.toLowerCase() ?? null)
        : (normalizeOptionalString(row.git_username)?.toLowerCase() ?? null)

    if (memberValue === null) {
      continue
    }

    const membershipKey = `${normalizedGroupName}\u0000${memberValue}`
    if (seenMemberships.has(membershipKey)) {
      const label = memberKey === "email" ? "email" : "git_username"
      return importValidationError(
        "rows",
        `Duplicate membership: group '${rawGroupName}', ${label} '${memberValue}'`,
      )
    }

    seenMemberships.add(membershipKey)
    group.memberKeys.push(memberValue)
  }

  const groups: ParsedGroupSetImportGroup[] = []
  for (const normalizedGroupName of groupOrder) {
    const group = groupsByNormalizedName.get(normalizedGroupName)
    if (group !== undefined) {
      groups.push(group)
    }
  }

  return { ok: true, value: groups }
}

function resolveGroupMemberIds(
  keys: readonly string[],
  index: ReadonlyMap<string, string | null>,
): string[] {
  const seen = new Set<string>()
  const memberIds: string[] = []

  for (const key of keys) {
    const memberId = index.get(key)
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
  index: ReadonlyMap<string, string | null>,
): { missingMembers: GroupSetImportMissingMember[]; totalMissing: number } {
  const missingMembers: GroupSetImportMissingMember[] = []
  let totalMissing = 0

  for (const group of groups) {
    let groupMissing = 0
    for (const key of group.memberKeys) {
      const matchedId = index.get(key)
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

export function previewImportGroupSet(
  roster: Roster,
  rows: readonly GroupSetImportRow[],
  options: GroupSetImportOptions = {},
): ValidationResult<GroupSetImportPreview> {
  const memberKey = options.memberKey ?? "email"
  const target = resolveNamedTargetGroupSet(
    roster,
    options.targetGroupSetId ?? null,
  )
  if (!target.ok) {
    return target
  }

  const parsed = parseGroupSetImportRows(rows, memberKey)
  if (!parsed.ok) {
    return parsed
  }

  const index = buildMemberIndex(roster, memberKey)
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    index,
  )

  return {
    ok: true,
    value: {
      mode: "import",
      groups: parsed.value.map((group) => ({
        name: group.name,
        memberCount: resolveGroupMemberIds(group.memberKeys, index).length,
      })),
      missingMembers,
      totalMissing,
    },
  }
}

function existingGroupsForTarget(
  roster: Roster,
  target: NamedGroupSet,
): Group[] {
  return target.groupIds
    .map((groupId) => findRosterGroup(roster, groupId))
    .filter((group): group is Group => group !== undefined)
}

function buildExistingGroupsByNormalizedName(
  groups: readonly Group[],
): Map<string, Group> {
  const existingByNormalizedName = new Map<string, Group>()
  for (const group of groups) {
    const normalized = normalizeName(group.name)
    if (!existingByNormalizedName.has(normalized)) {
      existingByNormalizedName.set(normalized, group)
    }
  }
  return existingByNormalizedName
}

export function importGroupSet(
  roster: Roster,
  source: GroupSetImportSource,
  rows: readonly GroupSetImportRow[],
  sequences: IdSequences,
  options: GroupSetImportOptions = {},
): ValidationResult<GroupSetImportResult> {
  const memberKey = options.memberKey ?? "email"
  const target = resolveNamedTargetGroupSet(
    roster,
    options.targetGroupSetId ?? null,
  )
  if (!target.ok) {
    return target
  }

  const parsed = parseGroupSetImportRows(rows, memberKey)
  if (!parsed.ok) {
    return parsed
  }

  const index = buildMemberIndex(roster, memberKey)
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    index,
  )

  let seq = sequences

  if (target.value === null) {
    const groupAlloc = allocateGroupIds(seq, parsed.value.length)
    seq = groupAlloc.sequences

    const groupsUpserted: Group[] = parsed.value.map((group, idx) => ({
      id: groupAlloc.ids[idx] as string,
      name: group.name,
      memberIds: resolveGroupMemberIds(group.memberKeys, index),
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }))

    const groupSetAlloc = allocateGroupSetId(seq)
    seq = groupSetAlloc.sequences

    return {
      ok: true,
      value: {
        mode: "import",
        groupSet: {
          id: groupSetAlloc.id,
          nameMode: "named",
          name: resolveImportedGroupSetName(source, options.groupSetName),
          groupIds: groupsUpserted.map((group) => group.id),
          connection: createImportConnection(source),
          repoNameTemplate: null,
          columnVisibility: {},
          columnSizing: {},
        },
        groupsUpserted,
        deletedGroupIds: [],
        missingMembers,
        totalMissing,
        idSequences: seq,
      },
    }
  }

  const existingByNormalizedName = buildExistingGroupsByNormalizedName(
    existingGroupsForTarget(roster, target.value),
  )
  const groupsUpserted: Group[] = []
  const appendedGroupIds: string[] = []

  for (const parsedGroup of parsed.value) {
    const memberIds = resolveGroupMemberIds(parsedGroup.memberKeys, index)
    const existing = existingByNormalizedName.get(parsedGroup.normalizedName)

    if (existing !== undefined) {
      groupsUpserted.push({
        ...existing,
        name: parsedGroup.name,
        memberIds,
      })
      continue
    }

    const alloc = allocateGroupId(seq)
    seq = alloc.sequences
    const created: Group = {
      id: alloc.id,
      name: parsedGroup.name,
      memberIds,
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }
    groupsUpserted.push(created)
    appendedGroupIds.push(created.id)
  }

  return {
    ok: true,
    value: {
      mode: "import",
      groupSet: {
        ...target.value,
        name: resolveImportedGroupSetName(source, target.value.name),
        groupIds: [...target.value.groupIds, ...appendedGroupIds],
        connection: createImportConnection(source),
      },
      groupsUpserted,
      deletedGroupIds: [],
      missingMembers,
      totalMissing,
      idSequences: seq,
    },
  }
}

export function previewReimportGroupSet(
  roster: Roster,
  groupSetId: string,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportPreview> {
  return previewImportGroupSet(roster, rows, {
    targetGroupSetId: groupSetId,
    memberKey: "email",
  })
}

export function reimportGroupSet(
  roster: Roster,
  groupSetId: string,
  source: GroupSetImportSource,
  rows: readonly GroupSetImportRow[],
  sequences: IdSequences = initialIdSequences(),
): ValidationResult<GroupSetImportResult> {
  return importGroupSet(roster, source, rows, sequences, {
    targetGroupSetId: groupSetId,
    memberKey: "email",
  })
}
