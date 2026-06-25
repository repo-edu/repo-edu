import type {
  Group,
  GroupSetExportRow,
  Roster,
  ValidationResult,
} from "../types.js"
import {
  buildMemberById,
  findRosterGroup,
  importValidationError,
} from "./shared.js"

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
    const group = findRosterGroup(roster, groupId)
    if (group === undefined) {
      continue
    }

    appendGroupRows(rows, group, memberById)
  }

  return { ok: true, value: rows }
}

function appendGroupRows(
  rows: GroupSetExportRow[],
  group: Group,
  memberById: ReturnType<typeof buildMemberById>,
): void {
  if (group.memberIds.length === 0) {
    rows.push({
      group_name: group.name,
      name: "",
      email: "",
    })
    return
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
