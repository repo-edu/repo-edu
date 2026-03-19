import {
  normalizeEmail,
  normalizeMissingEmailStatus,
  normalizeOptionalString,
} from "./roster.js"
import type {
  LmsImportConflict,
  MemberStatus,
  Roster,
  RosterImportFromLmsResult,
  RosterMember,
} from "./types.js"

// ---------------------------------------------------------------------------
// Private helpers (merge-only)
// ---------------------------------------------------------------------------

function pushMemberId(
  index: Map<string, string[]>,
  key: string,
  memberId: string,
) {
  const ids = index.get(key)
  if (ids === undefined) {
    index.set(key, [memberId])
    return
  }
  if (!ids.includes(memberId)) {
    ids.push(memberId)
  }
}

function availableIdsForMatch(
  ids: readonly string[] | undefined,
  matchedExistingIds: ReadonlySet<string>,
): string[] {
  if (ids === undefined) {
    return []
  }
  return ids.filter((id) => !matchedExistingIds.has(id))
}

function recordConflict(
  conflicts: LmsImportConflict[],
  seenSignatures: Set<string>,
  matchKey: LmsImportConflict["matchKey"],
  value: string,
  matchedIds: readonly string[],
) {
  const normalizedIds = [...matchedIds].sort()
  const signature = `${matchKey}:${value}:${normalizedIds.join(",")}`
  if (seenSignatures.has(signature)) {
    return
  }
  seenSignatures.add(signature)
  conflicts.push({
    matchKey,
    value,
    matchedIds: normalizedIds,
  })
}

function sortRosterMembers(members: readonly RosterMember[]): RosterMember[] {
  return [...members].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    })
    if (byName !== 0) {
      return byName
    }
    return left.id.localeCompare(right.id)
  })
}

function isRosterMemberEquivalent(
  left: RosterMember,
  right: RosterMember,
): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.email === right.email &&
    left.studentNumber === right.studentNumber &&
    left.gitUsername === right.gitUsername &&
    left.gitUsernameStatus === right.gitUsernameStatus &&
    left.status === right.status &&
    left.lmsStatus === right.lmsStatus &&
    left.lmsUserId === right.lmsUserId &&
    left.enrollmentType === right.enrollmentType &&
    left.enrollmentDisplay === right.enrollmentDisplay &&
    left.department === right.department &&
    left.institution === right.institution &&
    left.source === right.source
  )
}

// ---------------------------------------------------------------------------
// LMS merge
// ---------------------------------------------------------------------------

/**
 * Merge an incoming LMS roster into the existing roster, preserving local data.
 *
 * - Matched members (by lmsUserId, email, studentNumber, then id): LMS fields
 *   updated, local fields (gitUsername, department, etc.) preserved.
 * - Ambiguous matches are reported as conflicts and left untouched.
 * - Existing LMS-sourced members not in incoming: marked "dropped".
 * - Existing locally-added members (lmsUserId null): left unchanged.
 * - New incoming members: added as-is.
 * - Groups, groupSets, and assignments are preserved from the existing roster.
 */
export function mergeRosterFromLmsWithConflicts(
  existing: Roster,
  incoming: Roster,
): RosterImportFromLmsResult {
  const allExisting = [...existing.students, ...existing.staff]
  const allIncoming = [...incoming.students, ...incoming.staff]

  const existingById = new Map<string, RosterMember>()
  const existingByLmsUserId = new Map<string, string[]>()
  const existingByEmail = new Map<string, string[]>()
  const existingByStudentNumber = new Map<string, string[]>()

  for (const member of allExisting) {
    if (!existingById.has(member.id)) {
      existingById.set(member.id, member)
    }
    const lmsUserId = normalizeOptionalString(member.lmsUserId)
    if (lmsUserId !== null) {
      pushMemberId(existingByLmsUserId, lmsUserId, member.id)
    }
    const normalizedEmail = normalizeEmail(member.email)
    if (normalizedEmail.length > 0) {
      pushMemberId(existingByEmail, normalizedEmail, member.id)
    }
    const studentNumber = normalizeOptionalString(member.studentNumber)
    if (studentNumber !== null) {
      pushMemberId(existingByStudentNumber, studentNumber, member.id)
    }
  }

  const conflicts: LmsImportConflict[] = []
  const conflictSignatures = new Set<string>()
  const conflictedExistingIds = new Set<string>()
  const matchedExistingIds = new Set<string>()
  const incomingByMatchedExistingId = new Map<string, RosterMember>()
  const unmatchedIncoming: RosterMember[] = []

  for (const incomingMember of allIncoming) {
    const lmsUserId = normalizeOptionalString(incomingMember.lmsUserId)
    const normalizedEmail = normalizeEmail(incomingMember.email)
    const studentNumber = normalizeOptionalString(incomingMember.studentNumber)
    let matchedExistingId: string | null = null

    if (lmsUserId !== null) {
      const available = availableIdsForMatch(
        existingByLmsUserId.get(lmsUserId),
        matchedExistingIds,
      )
      if (available.length > 1) {
        recordConflict(
          conflicts,
          conflictSignatures,
          "lmsUserId",
          lmsUserId,
          available,
        )
        for (const memberId of available) {
          conflictedExistingIds.add(memberId)
        }
        continue
      }
      matchedExistingId = available[0] ?? null
    }

    if (matchedExistingId === null && normalizedEmail.length > 0) {
      const available = availableIdsForMatch(
        existingByEmail.get(normalizedEmail),
        matchedExistingIds,
      )
      if (available.length > 1) {
        recordConflict(
          conflicts,
          conflictSignatures,
          "email",
          normalizedEmail,
          available,
        )
        for (const memberId of available) {
          conflictedExistingIds.add(memberId)
        }
        continue
      }
      matchedExistingId = available[0] ?? null
    }

    if (matchedExistingId === null && studentNumber !== null) {
      const available = availableIdsForMatch(
        existingByStudentNumber.get(studentNumber),
        matchedExistingIds,
      )
      if (available.length > 1) {
        recordConflict(
          conflicts,
          conflictSignatures,
          "studentNumber",
          studentNumber,
          available,
        )
        for (const memberId of available) {
          conflictedExistingIds.add(memberId)
        }
        continue
      }
      matchedExistingId = available[0] ?? null
    }

    if (matchedExistingId === null) {
      const existingMember = existingById.get(incomingMember.id)
      if (
        existingMember !== undefined &&
        !matchedExistingIds.has(existingMember.id)
      ) {
        matchedExistingId = existingMember.id
      }
    }

    if (matchedExistingId === null) {
      unmatchedIncoming.push(incomingMember)
      continue
    }

    const existingMember = existingById.get(matchedExistingId)
    if (existingMember === undefined) {
      unmatchedIncoming.push(incomingMember)
      continue
    }

    if (
      lmsUserId !== null &&
      existingMember.lmsUserId !== null &&
      existingMember.lmsUserId !== lmsUserId
    ) {
      recordConflict(conflicts, conflictSignatures, "lmsUserId", lmsUserId, [
        existingMember.id,
      ])
      conflictedExistingIds.add(existingMember.id)
      continue
    }

    matchedExistingIds.add(matchedExistingId)
    incomingByMatchedExistingId.set(matchedExistingId, incomingMember)
  }

  let membersAdded = 0
  let membersUpdated = 0
  let membersUnchanged = 0
  const membersMissingEmail = allIncoming.filter(
    (member) => normalizeEmail(member.email).length === 0,
  ).length

  const merged: RosterMember[] = []

  for (const member of allExisting) {
    const match = incomingByMatchedExistingId.get(member.id)

    if (match !== undefined) {
      const email = match.email || member.email
      const lmsStatus: MemberStatus = match.lmsStatus ?? match.status
      const hasManualDroppedOverride =
        member.status === "dropped" && member.lmsStatus !== "dropped"
      const status = hasManualDroppedOverride
        ? "dropped"
        : normalizeMissingEmailStatus(email, lmsStatus)
      const mergedMember: RosterMember = {
        id: member.id,
        name: match.name,
        email,
        studentNumber: match.studentNumber ?? member.studentNumber,
        gitUsername: member.gitUsername,
        gitUsernameStatus: member.gitUsernameStatus,
        status,
        lmsStatus,
        lmsUserId: match.lmsUserId ?? member.lmsUserId,
        enrollmentType: match.enrollmentType,
        enrollmentDisplay: match.enrollmentDisplay,
        department: member.department,
        institution: member.institution,
        source: match.source,
      }
      merged.push(mergedMember)
      if (isRosterMemberEquivalent(member, mergedMember)) {
        membersUnchanged += 1
      } else {
        membersUpdated += 1
      }
    } else if (
      member.lmsUserId !== null &&
      !conflictedExistingIds.has(member.id)
    ) {
      // LMS-sourced member no longer in LMS -> mark dropped
      const droppedMember: RosterMember = {
        ...member,
        status: "dropped",
        lmsStatus: "dropped",
      }
      merged.push(droppedMember)
      if (isRosterMemberEquivalent(member, droppedMember)) {
        membersUnchanged += 1
      } else {
        membersUpdated += 1
      }
    } else {
      // Locally-added member -> leave unchanged
      merged.push(member)
      membersUnchanged += 1
    }
  }

  // Add new incoming members that weren't matched
  for (const member of unmatchedIncoming) {
    merged.push({
      ...member,
      status: normalizeMissingEmailStatus(member.email, member.status),
    })
    membersAdded += 1
  }

  // Split into students and staff by enrollment type
  const students: RosterMember[] = []
  const staff: RosterMember[] = []
  for (const member of merged) {
    if (member.enrollmentType === "student") {
      students.push(member)
    } else {
      staff.push(member)
    }
  }

  const roster = {
    connection: incoming.connection,
    students: sortRosterMembers(students),
    staff: sortRosterMembers(staff),
    groups: existing.groups,
    groupSets: existing.groupSets,
    assignments: existing.assignments,
  }

  return {
    roster,
    summary: {
      membersAdded,
      membersUpdated,
      membersUnchanged,
      membersMissingEmail,
    },
    conflicts,
    totalConflicts: conflicts.length,
  }
}

export function mergeRosterFromLms(existing: Roster, incoming: Roster): Roster {
  return mergeRosterFromLmsWithConflicts(existing, incoming).roster
}
