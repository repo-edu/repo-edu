import {
  allocateGroupId,
  allocateGroupIds,
  allocateGroupSetId,
  allocateTeamIds,
} from "./id-allocator.js"
import { normalizeName } from "./name-normalization.js"
import { normalizeEmail, normalizeOptionalString } from "./roster.js"
import {
  type Group,
  type GroupOrigin,
  type GroupSet,
  type GroupSetConnection,
  type GroupSetExportRow,
  type GroupSetImportMemberKey,
  type GroupSetImportMissingMember,
  type GroupSetImportPreview,
  type GroupSetImportResult,
  type GroupSetImportRow,
  type GroupSetImportSource,
  type IdSequences,
  initialIdSequences,
  type NamedGroupSet,
  type RepoBeeTeamMembershipDiff,
  type Roster,
  type RosterMember,
  type UsernameGroupSet,
  type UsernameTeam,
  type ValidationResult,
} from "./types.js"

const ORIGIN_LOCAL: GroupOrigin = "local"
const DEFAULT_REPOBEE_TEMPLATE = "{assignment}-{members}"

type ParsedGroupSetImportGroup = {
  name: string
  normalizedName: string
  memberKeys: string[]
}

type GroupSetImportOptions = {
  targetGroupSetId?: string | null
  groupSetName?: string | null
  memberKey?: GroupSetImportMemberKey
}

type RepoBeeApplyOptions = {
  targetGroupSetId?: string | null
  groupSetName?: string | null
}

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
// CSV import helpers
// ---------------------------------------------------------------------------

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

export function buildRosterGitUsernameIndex(
  roster: Roster,
): Map<string, string | null> {
  const index = new Map<string, string | null>()
  for (const member of roster.students.concat(roster.staff)) {
    const key = normalizeOptionalString(member.gitUsername)?.toLowerCase()
    if (!key) {
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

function buildMemberIndex(
  roster: Roster,
  memberKey: GroupSetImportMemberKey,
): Map<string, string | null> {
  return memberKey === "email"
    ? buildRosterEmailIndex(roster)
    : buildRosterGitUsernameIndex(roster)
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

function isEditableGroupSet(groupSet: GroupSet): boolean {
  const kind = groupSet.connection?.kind
  return kind !== "system" && kind !== "canvas" && kind !== "moodle"
}

function resolveTargetGroupSet(
  roster: Roster,
  targetGroupSetId: string | null,
): ValidationResult<GroupSet | null> {
  if (targetGroupSetId === null) {
    return { ok: true, value: null }
  }

  const target = roster.groupSets.find(
    (groupSet) => groupSet.id === targetGroupSetId,
  )
  if (target === undefined) {
    return importValidationError("targetGroupSetId", "Group set not found")
  }

  if (!isEditableGroupSet(target)) {
    return importValidationError(
      "targetGroupSetId",
      "Import into system or LMS-managed group sets is not allowed",
    )
  }

  return { ok: true, value: target }
}

function resolveNamedTargetGroupSet(
  roster: Roster,
  targetGroupSetId: string | null,
): ValidationResult<NamedGroupSet | null> {
  const result = resolveTargetGroupSet(roster, targetGroupSetId)
  if (!result.ok) return result
  if (result.value === null) return { ok: true, value: null }
  if (result.value.nameMode !== "named") {
    return importValidationError(
      "targetGroupSetId",
      "CSV import is only supported for named group sets",
    )
  }
  return { ok: true, value: result.value }
}

function resolveUnnamedTargetGroupSet(
  roster: Roster,
  targetGroupSetId: string | null,
): ValidationResult<UsernameGroupSet | null> {
  const result = resolveTargetGroupSet(roster, targetGroupSetId)
  if (!result.ok) return result
  if (result.value === null) return { ok: true, value: null }
  if (result.value.nameMode !== "unnamed") {
    return importValidationError(
      "targetGroupSetId",
      "RepoBee import is only supported for unnamed group sets",
    )
  }
  return { ok: true, value: result.value }
}

function resolveImportedGroupSetName(
  source: GroupSetImportSource,
  explicitName?: string | null,
): string {
  const override = explicitName?.trim()
  if (override && override.length > 0) {
    return override
  }

  const derived = source.sourceFilename.replace(/\.[^.]+$/, "").trim()
  if (derived.length > 0) {
    return derived
  }

  return source.sourceFilename
}

// ---------------------------------------------------------------------------
// CSV import workflows
// ---------------------------------------------------------------------------

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

  const existingGroups = target.value.groupIds
    .map((groupId) => roster.groups.find((group) => group.id === groupId))
    .filter((group): group is Group => group !== undefined)

  const existingByNormalizedName = new Map<string, Group>()
  for (const group of existingGroups) {
    const normalized = normalizeName(group.name)
    if (!existingByNormalizedName.has(normalized)) {
      existingByNormalizedName.set(normalized, group)
    }
  }

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

// ---------------------------------------------------------------------------
// RepoBee preview/apply helpers
// ---------------------------------------------------------------------------

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeTeamUsernames(usernames: readonly string[]): string[] {
  const normalized = usernames
    .map(normalizeUsername)
    .filter((username) => username.length > 0)
  return [...new Set(normalized)].sort((left, right) =>
    left.localeCompare(right),
  )
}

function canonicalTeamKey(usernames: readonly string[]): string {
  return usernames.join("\u0000")
}

function jaccardScore(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length === 0 && right.length === 0) {
    return 1
  }

  const leftSet = new Set(left)
  const rightSet = new Set(right)

  let intersection = 0
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      intersection += 1
    }
  }

  if (intersection === 0) {
    return 0
  }

  const union = new Set([...leftSet, ...rightSet]).size
  return intersection / union
}

function buildTeamMembershipDiff(
  previous: readonly string[],
  next: readonly string[],
): RepoBeeTeamMembershipDiff {
  const previousSet = new Set(previous)
  const nextSet = new Set(next)
  const addedUsernames = next.filter((value) => !previousSet.has(value))
  const removedUsernames = previous.filter((value) => !nextSet.has(value))

  return {
    previousUsernames: [...previous],
    nextUsernames: [...next],
    addedUsernames,
    removedUsernames,
  }
}

function compareNumberAscending(left: number, right: number): number {
  return left - right
}

function previewRepoBeeTeamDiff(
  previousTeams: readonly string[][],
  nextTeams: readonly string[][],
): Pick<
  Extract<GroupSetImportPreview, { mode: "replace" }>,
  "addedTeams" | "removedTeams" | "changedTeams" | "unchangedTeams"
> {
  const previousExactByKey = new Map<string, number[]>()
  for (const [index, team] of previousTeams.entries()) {
    const key = canonicalTeamKey(team)
    const bucket = previousExactByKey.get(key)
    if (bucket === undefined) {
      previousExactByKey.set(key, [index])
    } else {
      bucket.push(index)
    }
  }

  const matchedPrevious = new Set<number>()
  const matchedNext = new Set<number>()
  const unchangedTeams: string[][] = []

  for (const [index, team] of nextTeams.entries()) {
    const key = canonicalTeamKey(team)
    const bucket = previousExactByKey.get(key)
    if (bucket === undefined || bucket.length === 0) {
      continue
    }

    const previousIndex = bucket.shift()
    if (previousIndex === undefined) {
      continue
    }

    matchedPrevious.add(previousIndex)
    matchedNext.add(index)
    unchangedTeams.push(team)
  }

  const unmatchedPrevious = previousTeams
    .map((_, index) => index)
    .filter((index) => !matchedPrevious.has(index))
  const unmatchedNext = nextTeams
    .map((_, index) => index)
    .filter((index) => !matchedNext.has(index))

  const changedTeams: RepoBeeTeamMembershipDiff[] = []

  while (unmatchedPrevious.length > 0 && unmatchedNext.length > 0) {
    let bestScore = 0
    let bestPreviousIndex = -1
    let bestNextIndex = -1

    for (const previousIndex of unmatchedPrevious) {
      for (const nextIndex of unmatchedNext) {
        const score = jaccardScore(
          previousTeams[previousIndex] as string[],
          nextTeams[nextIndex] as string[],
        )
        if (score <= 0) {
          continue
        }

        const better =
          score > bestScore ||
          (score === bestScore &&
            (bestPreviousIndex < 0 ||
              previousIndex < bestPreviousIndex ||
              (previousIndex === bestPreviousIndex &&
                nextIndex < bestNextIndex)))

        if (!better) {
          continue
        }

        bestScore = score
        bestPreviousIndex = previousIndex
        bestNextIndex = nextIndex
      }
    }

    if (bestScore <= 0 || bestPreviousIndex < 0 || bestNextIndex < 0) {
      break
    }

    changedTeams.push(
      buildTeamMembershipDiff(
        previousTeams[bestPreviousIndex] as string[],
        nextTeams[bestNextIndex] as string[],
      ),
    )

    unmatchedPrevious.splice(unmatchedPrevious.indexOf(bestPreviousIndex), 1)
    unmatchedNext.splice(unmatchedNext.indexOf(bestNextIndex), 1)
  }

  const removedTeams = unmatchedPrevious
    .sort(compareNumberAscending)
    .map((index) => previousTeams[index] as string[])
  const addedTeams = unmatchedNext
    .sort(compareNumberAscending)
    .map((index) => nextTeams[index] as string[])

  return {
    addedTeams,
    removedTeams,
    changedTeams,
    unchangedTeams,
  }
}

function buildMemberById(roster: Roster): Map<string, RosterMember> {
  return new Map(
    roster.students
      .concat(roster.staff)
      .map((member) => [member.id, member] as const),
  )
}

function extractGroupSetTeamUsernames(
  roster: Roster,
  groupSet: GroupSet,
): string[][] {
  if (groupSet.nameMode === "unnamed") {
    return groupSet.teams.map((team) =>
      normalizeTeamUsernames(team.gitUsernames),
    )
  }

  const memberById = buildMemberById(roster)
  return groupSet.groupIds
    .map((groupId) => roster.groups.find((group) => group.id === groupId))
    .filter((group): group is Group => group !== undefined)
    .map((group) => {
      const usernames = group.memberIds
        .map((memberId) => memberById.get(memberId))
        .filter((member): member is RosterMember => member !== undefined)
        .map((member) => member.gitUsername)
        .filter((value): value is string => value !== null)
      return normalizeTeamUsernames(usernames)
    })
}

export function previewReplaceGroupSetFromRepoBee(
  roster: Roster,
  targetGroupSetId: string,
  nextTeams: readonly string[][],
): ValidationResult<GroupSetImportPreview> {
  const target = resolveUnnamedTargetGroupSet(roster, targetGroupSetId)
  if (!target.ok) {
    return target
  }
  if (target.value === null) {
    return importValidationError("targetGroupSetId", "Group set not found")
  }

  const normalizedNextTeams = nextTeams.map((team) =>
    normalizeTeamUsernames(team),
  )
  const previousTeams = extractGroupSetTeamUsernames(roster, target.value)
  const diff = previewRepoBeeTeamDiff(previousTeams, normalizedNextTeams)

  return {
    ok: true,
    value: {
      mode: "replace",
      ...diff,
    },
  }
}

export function replaceGroupSetFromRepoBee(
  roster: Roster,
  source: GroupSetImportSource,
  nextTeams: readonly string[][],
  sequences: IdSequences,
  options: RepoBeeApplyOptions = {},
): ValidationResult<GroupSetImportResult> {
  const target = resolveUnnamedTargetGroupSet(
    roster,
    options.targetGroupSetId ?? null,
  )
  if (!target.ok) {
    return target
  }

  let seq = sequences
  const normalizedTeams = nextTeams.map((team) => normalizeTeamUsernames(team))
  const teamAlloc = allocateTeamIds(seq, normalizedTeams.length)
  seq = teamAlloc.sequences

  const teams: UsernameTeam[] = normalizedTeams.map((usernames, index) => ({
    id: teamAlloc.ids[index] as string,
    gitUsernames: usernames,
  }))

  if (target.value === null) {
    const groupSetAlloc = allocateGroupSetId(seq)
    seq = groupSetAlloc.sequences

    return {
      ok: true,
      value: {
        mode: "replace",
        groupSet: {
          id: groupSetAlloc.id,
          nameMode: "unnamed",
          name: resolveImportedGroupSetName(source, options.groupSetName),
          teams,
          connection: createImportConnection(source),
          repoNameTemplate: DEFAULT_REPOBEE_TEMPLATE,
          columnVisibility: {},
          columnSizing: {},
        },
        groupsUpserted: [],
        deletedGroupIds: [],
        missingMembers: [],
        totalMissing: 0,
        idSequences: seq,
      },
    }
  }

  return {
    ok: true,
    value: {
      mode: "replace",
      groupSet: {
        ...target.value,
        teams,
        connection: createImportConnection(source),
      },
      groupsUpserted: [],
      deletedGroupIds: [],
      missingMembers: [],
      totalMissing: 0,
      idSequences: seq,
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
  if (groupSet.nameMode !== "named") {
    return importValidationError(
      "groupSetId",
      "CSV export is only supported for named group sets",
    )
  }

  const memberById = buildMemberById(roster)
  const rows: GroupSetExportRow[] = []

  for (const groupId of groupSet.groupIds) {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    if (group === undefined) {
      continue
    }

    if (group.memberIds.length === 0) {
      rows.push({
        group_name: group.name,
        name: "",
        email: "",
      })
      continue
    }

    for (const memberId of group.memberIds) {
      const member = memberById.get(memberId)
      rows.push({
        group_name: group.name,
        name: member?.name ?? "",
        email: member?.email ?? "",
      })
    }
  }

  return { ok: true, value: rows }
}

export function exportStudentsTxt(
  roster: Roster,
  groupSetId: string,
): ValidationResult<string> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found")
  }
  if (groupSet.nameMode !== "unnamed") {
    return importValidationError(
      "groupSetId",
      "TXT export is only supported for unnamed group sets",
    )
  }

  const lines = groupSet.teams.map((team) => team.gitUsernames.join(" "))
  return { ok: true, value: lines.join("\n") }
}
