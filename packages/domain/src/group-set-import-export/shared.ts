import { normalizeName } from "../name-normalization.js"
import { normalizeEmail, normalizeOptionalString } from "../roster.js"
import type {
  Group,
  GroupSet,
  GroupSetConnection,
  GroupSetImportMemberKey,
  GroupSetImportSource,
  NamedGroupSet,
  Roster,
  RosterMember,
  UsernameGroupSet,
  ValidationResult,
} from "../types.js"

export type GroupSetImportOptions = {
  targetGroupSetId?: string | null
  groupSetName?: string | null
  memberKey?: GroupSetImportMemberKey
}

export type RepoBeeApplyOptions = {
  targetGroupSetId?: string | null
  groupSetName?: string | null
}

export function importValidationError<T>(
  path: string,
  message: string,
): ValidationResult<T> {
  return {
    ok: false,
    issues: [{ path, message }],
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

export function buildMemberIndex(
  roster: Roster,
  memberKey: GroupSetImportMemberKey,
): Map<string, string | null> {
  return memberKey === "email"
    ? buildRosterEmailIndex(roster)
    : buildRosterGitUsernameIndex(roster)
}

export function createImportConnection(
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

export function resolveNamedTargetGroupSet(
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

export function resolveUnnamedTargetGroupSet(
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

export function resolveImportedGroupSetName(
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

export function buildMemberById(roster: Roster): Map<string, RosterMember> {
  return new Map(
    roster.students
      .concat(roster.staff)
      .map((member) => [member.id, member] as const),
  )
}

export function findRosterGroup(
  roster: Roster,
  groupId: string,
): Group | undefined {
  return roster.groups.find((group) => group.id === groupId)
}

export { normalizeName, normalizeOptionalString }
