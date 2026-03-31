import { allocateMemberId } from "./id-allocator.js"
import { normalizeOptionalString } from "./roster.js"
import type { IdSequences, Roster, RosterMember } from "./types.js"

export type ReconcileRosterFromGitUsernamesResult = {
  roster: Roster
  idSequences: IdSequences
  mapping: Record<string, string>
}

function buildGitUsernameIndex(roster: Roster): Map<string, string> {
  const index = new Map<string, string>()
  for (const member of roster.students.concat(roster.staff)) {
    const key = normalizeOptionalString(member.gitUsername)?.toLowerCase()
    if (!key || index.has(key)) {
      continue
    }
    index.set(key, member.id)
  }
  return index
}

function createRepoBeeMember(id: string, username: string): RosterMember {
  return {
    id,
    name: username,
    email: "",
    studentNumber: null,
    gitUsername: username,
    gitUsernameStatus: "unknown",
    status: "active",
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student",
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "repobee-import",
  }
}

export function reconcileRosterFromGitUsernames(
  roster: Roster,
  usernames: readonly string[],
  sequences: IdSequences,
): ReconcileRosterFromGitUsernamesResult {
  const normalizedUsernames = [
    ...new Set(
      usernames
        .map((username) => username.trim().toLowerCase())
        .filter((username) => username.length > 0),
    ),
  ]

  const students = [...roster.students]
  const mapping: Record<string, string> = {}
  const index = buildGitUsernameIndex(roster)
  let seq = sequences

  for (const username of normalizedUsernames) {
    const existingId = index.get(username)
    if (existingId !== undefined) {
      mapping[username] = existingId
      continue
    }

    const alloc = allocateMemberId(seq)
    seq = alloc.sequences
    const created = createRepoBeeMember(alloc.id, username)
    students.push(created)
    index.set(username, created.id)
    mapping[username] = created.id
  }

  return {
    roster: {
      ...roster,
      students,
    },
    idSequences: seq,
    mapping,
  }
}
