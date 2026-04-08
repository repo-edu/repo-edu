import type { RosterMember } from "../types.js"
import type {
  IdentityBridgeResult,
  IdentityConfidence,
  IdentityMatch,
  PersonDbSnapshot,
} from "./types.js"

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeForBridge(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLowerCase()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function bridgeAuthorsToRoster(
  personDb: PersonDbSnapshot,
  members: RosterMember[],
): IdentityBridgeResult {
  const matches: IdentityMatch[] = []
  const matchedPersonIds = new Set<string>()
  const matchedMemberIds = new Set<string>()

  const memberByEmail = new Map<string, RosterMember>()
  const memberByName = new Map<string, RosterMember>()

  for (const member of members) {
    const normEmail = normalizeForBridge(member.email)
    if (normEmail.length > 0) {
      memberByEmail.set(normEmail, member)
    }
    const normName = normalizeForBridge(member.name)
    if (normName.length > 0 && !memberByName.has(normName)) {
      memberByName.set(normName, member)
    }
  }

  for (const person of personDb.persons) {
    const allEmails = [
      person.canonicalEmail,
      ...person.aliases.map((a) => a.email),
    ]
      .map(normalizeForBridge)
      .filter((e) => e.length > 0)

    const allNames = [
      person.canonicalName,
      ...person.aliases.map((a) => a.name),
    ]
      .map(normalizeForBridge)
      .filter((n) => n.length > 0)

    let matched: RosterMember | undefined
    let confidence: IdentityConfidence = "unmatched"

    for (const email of allEmails) {
      const member = memberByEmail.get(email)
      if (member && !matchedMemberIds.has(member.id)) {
        matched = member
        confidence = "exact-email"
        break
      }
    }

    if (!matched) {
      for (const name of allNames) {
        const member = memberByName.get(name)
        if (member && !matchedMemberIds.has(member.id)) {
          matched = member
          confidence = "fuzzy-name"
          break
        }
      }
    }

    if (matched) {
      matches.push({
        personId: person.id,
        canonicalName: person.canonicalName,
        canonicalEmail: person.canonicalEmail,
        memberId: matched.id,
        memberName: matched.name,
        confidence,
      })
      matchedPersonIds.add(person.id)
      matchedMemberIds.add(matched.id)
    }
  }

  return {
    matches,
    unmatchedPersonIds: personDb.persons
      .filter((p) => !matchedPersonIds.has(p.id))
      .map((p) => p.id),
    unmatchedMemberIds: members
      .filter((m) => !matchedMemberIds.has(m.id))
      .map((m) => m.id),
  }
}
