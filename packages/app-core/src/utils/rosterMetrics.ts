import type {
  Assignment,
  Group,
  GroupSelectionMode,
  Roster,
  RosterMember,
  RosterMemberId,
} from "@repo-edu/backend-interface/types"

export const isActiveStudent = (student: RosterMember) =>
  student.status === "active"

export const getActiveStudents = (students: RosterMember[]) =>
  students.filter(isActiveStudent)

export const buildStudentMap = (students: RosterMember[]) =>
  new Map<RosterMemberId, RosterMember>(
    students.map((student) => [student.id, student]),
  )

export const buildGroupMembershipMap = (groups: Group[]) => {
  const map = new Map<RosterMemberId, string[]>()
  for (const group of groups) {
    for (const memberId of group.member_ids) {
      const existing = map.get(memberId) ?? []
      existing.push(group.name)
      map.set(memberId, existing)
    }
  }
  return map
}

function escapeRegexChar(char: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char
}

function globToRegex(pattern: string): RegExp | null {
  let regex = ""

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]

    if (char === "\\") {
      const next = pattern[i + 1]
      if (next) {
        regex += escapeRegexChar(next)
        i += 1
      } else {
        regex += "\\\\"
      }
      continue
    }

    if (char === "*") {
      regex += ".*"
      continue
    }

    if (char === "?") {
      regex += "."
      continue
    }

    if (char === "[") {
      let j = i + 1
      let negate = false
      if (pattern[j] === "!") {
        negate = true
        j += 1
      }

      let classBody = ""
      let closed = false
      for (; j < pattern.length; j += 1) {
        const classChar = pattern[j]
        if (classChar === "]") {
          closed = true
          break
        }
        if (classChar === "\\") {
          const escaped = pattern[j + 1]
          if (escaped) {
            classBody += `\\${escaped}`
            j += 1
            continue
          }
        }
        if (classChar === "]" || classChar === "^") {
          classBody += `\\${classChar}`
        } else {
          classBody += classChar
        }
      }

      if (!closed || classBody.length === 0) {
        return null
      }

      regex += `[${negate ? "^" : ""}${classBody}]`
      i = j
      continue
    }

    regex += escapeRegexChar(char)
  }

  try {
    return new RegExp(`^${regex}$`)
  } catch {
    return null
  }
}

function applyGroupSelection(groups: Group[], selection: GroupSelectionMode) {
  const excludedIds = new Set(selection.excluded_group_ids)
  if (selection.kind === "all") {
    return groups.filter((group) => !excludedIds.has(group.id))
  }

  const matcher = globToRegex(selection.pattern)
  if (!matcher) return []

  return groups.filter(
    (group) => matcher.test(group.name) && !excludedIds.has(group.id),
  )
}

export function resolveAssignmentGroups(
  roster: Roster,
  assignment: Assignment,
): Group[] {
  const groupSet = roster.group_sets.find(
    (set) => set.id === assignment.group_set_id,
  )
  if (!groupSet) return []

  const groupsById = new Map(roster.groups.map((group) => [group.id, group]))
  const groups = groupSet.group_ids
    .map((groupId) => groupsById.get(groupId))
    .filter((group): group is Group => !!group)

  return applyGroupSelection(groups, groupSet.group_selection)
}
