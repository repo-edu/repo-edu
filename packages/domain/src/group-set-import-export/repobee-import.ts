import { allocateGroupSetId, allocateTeamIds } from "../id-allocator.js"
import type {
  Group,
  GroupSet,
  GroupSetImportPreview,
  GroupSetImportResult,
  GroupSetImportSource,
  IdSequences,
  RepoBeeTeamMembershipDiff,
  Roster,
  RosterMember,
  UsernameTeam,
  ValidationResult,
} from "../types.js"
import {
  buildMemberById,
  createImportConnection,
  findRosterGroup,
  importValidationError,
  type RepoBeeApplyOptions,
  resolveImportedGroupSetName,
  resolveUnnamedTargetGroupSet,
} from "./shared.js"

const DEFAULT_REPOBEE_TEMPLATE = "{assignment}-{members}"

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

function usernamesForGroup(
  group: Group,
  memberById: ReadonlyMap<string, RosterMember>,
): string[] {
  const usernames = group.memberIds
    .map((memberId) => memberById.get(memberId))
    .filter((member): member is RosterMember => member !== undefined)
    .map((member) => member.gitUsername)
    .filter((value): value is string => value !== null)
  return normalizeTeamUsernames(usernames)
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
    .map((groupId) => findRosterGroup(roster, groupId))
    .filter((group): group is Group => group !== undefined)
    .map((group) => usernamesForGroup(group, memberById))
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
