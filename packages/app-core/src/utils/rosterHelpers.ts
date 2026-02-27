import type {
  Group,
  RosterMember,
  RosterMemberId,
} from "@repo-edu/backend-interface/types"

/**
 * Returns only the member IDs from a group that correspond to active roster members.
 *
 * Non-system groups preserve all member IDs (including non-active members) in the data model.
 * This helper filters to active members at consumption time (display, operations, exports).
 */
export function activeMemberIds(
  allMembers: RosterMember[],
  group: Group,
): RosterMemberId[] {
  const activeIds = new Set(
    allMembers.filter((m) => m.status === "active").map((m) => m.id),
  )
  return group.member_ids.filter((id) => activeIds.has(id))
}
