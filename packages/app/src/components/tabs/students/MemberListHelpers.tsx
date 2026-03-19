import type { MemberStatus, Roster, RosterMember } from "@repo-edu/domain/types"
import {
  chainComparisons,
  compareNullableText,
  compareNumber,
  compareText,
} from "../../../utils/sorting.js"

export function RosterSourceBadge({ roster }: { roster: Roster | null }) {
  if (!roster?.connection) return null

  const { connection } = roster
  let sourceLabel: string
  switch (connection.kind) {
    case "canvas":
      sourceLabel = "LMS (Canvas)"
      break
    case "moodle":
      sourceLabel = "LMS (Moodle)"
      break
    case "import":
      sourceLabel = connection.sourceFilename
      break
  }

  return (
    <span className="text-xs text-muted-foreground truncate min-w-0">
      {sourceLabel}
      {connection.lastUpdated && (
        <> {new Date(connection.lastUpdated).toLocaleDateString()}</>
      )}
    </span>
  )
}

export function columnLabel(id: string): string {
  switch (id) {
    case "name":
      return "Name"
    case "email":
      return "Email"
    case "status":
      return "Status"
    case "memberType":
      return "Role"
    case "groups":
      return "Groups"
    case "gitUsername":
      return "Git Username"
    default:
      return id
  }
}

const memberStatusRank: Record<MemberStatus, number> = {
  active: 0,
  dropped: 1,
  incomplete: 2,
}

export function compareRosterMembersByName(
  left: RosterMember,
  right: RosterMember,
): number {
  return chainComparisons(
    compareText(left.name, right.name),
    compareText(left.email, right.email),
    compareText(left.id, right.id),
  )
}

export function compareRosterMemberNames(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return compareRosterMembersByName(rowA.original, rowB.original)
}

export function compareRosterMemberEmails(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareText(rowA.original.email, rowB.original.email),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

export function compareRosterMemberStatuses(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNumber(
      memberStatusRank[rowA.original.status],
      memberStatusRank[rowB.original.status],
    ),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

const ENROLLMENT_TYPE_ORDER: Record<string, number> = {
  student: 0,
  teacher: 1,
  ta: 2,
  designer: 3,
  observer: 4,
  other: 5,
}

export function compareRosterMemberRoles(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNumber(
      ENROLLMENT_TYPE_ORDER[rowA.original.enrollmentType] ?? 5,
      ENROLLMENT_TYPE_ORDER[rowB.original.enrollmentType] ?? 5,
    ),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

export function compareRosterMemberGitUsernames(
  rowA: { original: RosterMember },
  rowB: { original: RosterMember },
): number {
  return chainComparisons(
    compareNullableText(rowA.original.gitUsername, rowB.original.gitUsername),
    compareRosterMembersByName(rowA.original, rowB.original),
  )
}

export function getStatusIcon(status: RosterMember["gitUsernameStatus"]) {
  switch (status) {
    case "valid":
      return <span className="text-success">&check;</span>
    case "invalid":
      return <span className="text-destructive">&cross;</span>
    default:
      return null
  }
}
