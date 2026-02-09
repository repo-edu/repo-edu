import type { RosterMember } from "@repo-edu/backend-interface/types"

/**
 * Extract the last word of a name (last name heuristic).
 */
function lastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1].toLowerCase()
}

/**
 * Extract the first word of a name (first name heuristic).
 */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0].toLowerCase()
}

/**
 * Generate a raw group name from roster members.
 *
 * Rules:
 * - 0 members: ""
 * - 1 member: "firstname_lastname"
 * - 2-5 members: last names sorted, joined by dash
 * - 6+ members: 5 last names sorted + "-+N" remainder
 *
 * No slug normalization (that's backend-only via `normalize_group_name`).
 */
export function generateGroupName(members: RosterMember[]): string {
  if (members.length === 0) return ""

  if (members.length === 1) {
    return `${firstName(members[0].name)}_${lastName(members[0].name)}`
  }

  const lastNames = members.map((m) => lastName(m.name)).sort()

  if (members.length <= 5) {
    return lastNames.join("-")
  }

  const shown = lastNames.slice(0, 5)
  const remainder = members.length - 5
  return `${shown.join("-")}-+${remainder}`
}
