import { resolveAssignmentGroups } from "./group-selection.js"
import { systemSetsMissing } from "./group-set.js"
import { normalizeName } from "./name-normalization.js"
import { computeRepoName, defaultRepoTemplate } from "./repository-planning.js"
import { normalizeEmail } from "./roster.js"
import type {
  Assignment,
  GitIdentityMode,
  Group,
  NamedGroupSet,
  Roster,
  RosterValidationIssue,
  RosterValidationKind,
  RosterValidationResult,
  UsernameGroupSet,
} from "./types.js"

export { normalizeName }

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort()
}

function findDuplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
      continue
    }
    seen.add(value)
  }

  return sortedStrings([...duplicates])
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  const parts = trimmed.split("@")
  if (parts.length !== 2) {
    return false
  }

  const [local, domain] = parts
  if (local.length === 0 || domain.length === 0 || local.includes(" ")) {
    return false
  }

  const lastDot = domain.lastIndexOf(".")
  return lastDot > 0 && lastDot < domain.length - 1
}

function validateGroupSetOriginConsistency(
  roster: Roster,
  groupSet: NamedGroupSet,
  issues: RosterValidationIssue[],
) {
  for (const groupId of groupSet.groupIds) {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    if (group === undefined) {
      continue
    }

    const originMatches = (() => {
      switch (groupSet.connection?.kind) {
        case "system":
          return group.origin === "system"
        case "canvas":
        case "moodle":
          return group.origin === "lms"
        case "import":
          return group.origin === "local" && group.lmsGroupId === null
        case undefined:
          return true
      }
    })()

    if (originMatches) {
      continue
    }

    issues.push({
      kind: "invalid_group_origin",
      affectedIds: [group.id],
      context: `Group '${group.name}' has origin '${group.origin}' but group set '${groupSet.name}' expects different origin`,
    })
  }
}

function activeGroupGitUsernameToken(
  groupMemberIds: readonly string[],
  memberLookup: ReadonlyMap<string, Roster["students"][number]>,
): string {
  const usernames = [
    ...new Set(
      groupMemberIds
        .map((memberId) => memberLookup.get(memberId))
        .filter(
          (member): member is NonNullable<typeof member> =>
            member !== undefined && member.status === "active",
        )
        .map((member) => member.gitUsername?.trim().toLowerCase() ?? "")
        .filter((username) => username.length > 0),
    ),
  ]

  usernames.sort((left, right) => left.localeCompare(right))
  return usernames.map((username) => username.replaceAll("-", ".")).join("-")
}

function normalizeGitUsernames(usernames: readonly string[]): string[] {
  const normalized = usernames
    .map((username) => username.trim().toLowerCase())
    .filter((username) => username.length > 0)
  const unique = [...new Set(normalized)]
  unique.sort((left, right) => left.localeCompare(right))
  return unique
}

function validateUnnamedAssignmentWithTemplate(
  groupSet: UsernameGroupSet,
  assignment: Assignment,
  template: string,
): RosterValidationIssue[] {
  const issues: RosterValidationIssue[] = []
  const repoNameMap = new Map<string, string[]>()

  for (const team of groupSet.teams) {
    const gitUsernames = normalizeGitUsernames(team.gitUsernames)
    if (gitUsernames.length === 0) {
      issues.push({
        kind: "empty_group",
        affectedIds: [team.id],
        context: null,
      })
      continue
    }

    const templateGroup: Group = {
      id: team.id,
      name: "",
      memberIds: [],
      origin: "local",
      lmsGroupId: null,
    }
    const repoName = computeRepoName(template, assignment, templateGroup, {
      members: gitUsernames
        .map((username) => username.replaceAll("-", "."))
        .join("-"),
    })
    repoNameMap.set(repoName, [...(repoNameMap.get(repoName) ?? []), team.id])
  }

  for (const [repoName, groupIds] of repoNameMap) {
    if (groupIds.length <= 1) {
      continue
    }
    issues.push({
      kind: "duplicate_repo_name_in_assignment",
      affectedIds: sortedStrings(groupIds),
      context: repoName,
    })
  }

  return issues
}

function validateNamedGroupSet(
  roster: Roster,
  groupSet: NamedGroupSet,
  issues: RosterValidationIssue[],
) {
  const names = groupSet.groupIds
    .map((groupId) => roster.groups.find((group) => group.id === groupId))
    .filter((group): group is NonNullable<typeof group> => group !== undefined)
    .map((group) => normalizeName(group.name))
  const duplicateNames = findDuplicateStrings(names)
  if (duplicateNames.length > 0) {
    issues.push({
      kind: "duplicate_group_name_in_assignment",
      affectedIds: duplicateNames,
      context: `Duplicate normalized group names in group set '${groupSet.name}'`,
    })
  }

  const existingGroupIds = new Set(roster.groups.map((group) => group.id))
  const orphanGroupRefs = groupSet.groupIds.filter(
    (groupId) => !existingGroupIds.has(groupId),
  )
  if (orphanGroupRefs.length > 0) {
    issues.push({
      kind: "orphan_group_member",
      affectedIds: orphanGroupRefs,
      context: `Group set '${groupSet.name}' references non-existent groups`,
    })
  }
}

function validateUnnamedGroupSet(
  groupSet: UsernameGroupSet,
  issues: RosterValidationIssue[],
) {
  for (const team of groupSet.teams) {
    if (team.gitUsernames.length === 0) {
      issues.push({
        kind: "empty_group",
        affectedIds: [team.id],
        context: `Team '${team.id}' in group set '${groupSet.name}' has no git usernames`,
      })
      continue
    }

    const duplicateUsernames = findDuplicateStrings(team.gitUsernames)
    if (duplicateUsernames.length > 0) {
      issues.push({
        kind: "duplicate_group_id_in_assignment",
        affectedIds: duplicateUsernames,
        context: `Duplicate git usernames within team '${team.id}' in group set '${groupSet.name}'`,
      })
    }
  }
}

export function validateRoster(roster: Roster): RosterValidationResult {
  const issues: RosterValidationIssue[] = []

  if (systemSetsMissing(roster)) {
    issues.push({
      kind: "system_group_sets_missing",
      affectedIds: [],
      context: "Call ensureSystemGroupSets before validation",
    })
  }

  const allMemberIds = roster.students
    .concat(roster.staff)
    .map((member) => member.id)
  const duplicateMemberIds = findDuplicateStrings(allMemberIds)
  if (duplicateMemberIds.length > 0) {
    issues.push({
      kind: "duplicate_student_id",
      affectedIds: duplicateMemberIds,
      context: null,
    })
  }

  const missingEmails = roster.students
    .filter((member) => member.email.trim().length === 0)
    .map((member) => member.id)
  if (missingEmails.length > 0) {
    issues.push({
      kind: "missing_email",
      affectedIds: missingEmails,
      context: null,
    })
  }

  const invalidEmails = roster.students
    .filter((member) => member.email.trim().length > 0)
    .filter((member) => !isValidEmail(member.email))
    .map((member) => member.id)
  if (invalidEmails.length > 0) {
    issues.push({
      kind: "invalid_email",
      affectedIds: invalidEmails,
      context: null,
    })
  }

  const duplicateEmails = findDuplicateStrings(
    roster.students
      .filter((member) => member.email.trim().length > 0)
      .map((member) => normalizeEmail(member.email)),
  )
  if (duplicateEmails.length > 0) {
    issues.push({
      kind: "duplicate_email",
      affectedIds: duplicateEmails,
      context: null,
    })
  }

  const duplicateAssignmentNames = findDuplicateStrings(
    roster.assignments.map((assignment) => normalizeName(assignment.name)),
  )
  if (duplicateAssignmentNames.length > 0) {
    issues.push({
      kind: "duplicate_assignment_name",
      affectedIds: duplicateAssignmentNames,
      context: null,
    })
  }

  const duplicateGroupIds = findDuplicateStrings(
    roster.groups.map((group) => group.id),
  )
  if (duplicateGroupIds.length > 0) {
    issues.push({
      kind: "duplicate_group_id_in_assignment",
      affectedIds: duplicateGroupIds,
      context: "Duplicate group IDs in roster",
    })
  }

  const duplicateGroupSetIds = findDuplicateStrings(
    roster.groupSets.map((groupSet) => groupSet.id),
  )
  if (duplicateGroupSetIds.length > 0) {
    issues.push({
      kind: "duplicate_group_id_in_assignment",
      affectedIds: duplicateGroupSetIds,
      context: "Duplicate group set IDs in roster",
    })
  }

  for (const groupSet of roster.groupSets) {
    if (groupSet.nameMode === "named") {
      validateNamedGroupSet(roster, groupSet, issues)
    } else {
      validateUnnamedGroupSet(groupSet, issues)
    }
  }

  const misplacedStudents = roster.students
    .filter((member) => member.enrollmentType !== "student")
    .map((member) => member.id)
  if (misplacedStudents.length > 0) {
    issues.push({
      kind: "invalid_enrollment_partition",
      affectedIds: misplacedStudents,
      context: "Non-students in students array",
    })
  }

  const misplacedStaff = roster.staff
    .filter((member) => member.enrollmentType === "student")
    .map((member) => member.id)
  if (misplacedStaff.length > 0) {
    issues.push({
      kind: "invalid_enrollment_partition",
      affectedIds: misplacedStaff,
      context: "Students in staff array",
    })
  }

  const memberIdSet = new Set(allMemberIds)
  for (const group of roster.groups) {
    const orphanMembers = group.memberIds.filter(
      (memberId) => !memberIdSet.has(memberId),
    )
    if (orphanMembers.length > 0) {
      issues.push({
        kind: "orphan_group_member",
        affectedIds: orphanMembers,
        context: `Group '${group.name}' references non-existent members`,
      })
    }
  }

  for (const groupSet of roster.groupSets) {
    if (groupSet.nameMode === "named") {
      validateGroupSetOriginConsistency(roster, groupSet, issues)
    }
  }

  return { issues }
}

export function validateAssignment(
  roster: Roster,
  assignmentId: string,
  identityMode: GitIdentityMode,
): RosterValidationResult {
  return validateAssignmentWithTemplate(
    roster,
    assignmentId,
    identityMode,
    defaultRepoTemplate,
  )
}

export function validateAssignmentWithTemplate(
  roster: Roster,
  assignmentId: string,
  identityMode: GitIdentityMode,
  template: string,
): RosterValidationResult {
  const assignment = roster.assignments.find(
    (candidate) => candidate.id === assignmentId,
  )
  if (assignment === undefined) {
    return { issues: [] }
  }

  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  if (groupSet?.nameMode === "unnamed") {
    return {
      issues: validateUnnamedAssignmentWithTemplate(
        groupSet,
        assignment,
        template,
      ),
    }
  }

  const groups = resolveAssignmentGroups(roster, assignment)
  const memberLookup = new Map(
    roster.students
      .concat(roster.staff)
      .map((member) => [member.id, member] as const),
  )
  const issues: RosterValidationIssue[] = []

  const duplicateGroupNames = findDuplicateStrings(
    groups.map((group) => normalizeName(group.name)),
  )
  if (duplicateGroupNames.length > 0) {
    issues.push({
      kind: "duplicate_group_name_in_assignment",
      affectedIds: duplicateGroupNames,
      context: null,
    })
  }

  const memberGroupCounts = new Map<string, number>()
  const emptyGroups = new Set<string>()
  const missingGitUsernames = new Set<string>()
  const invalidGitUsernames = new Set<string>()
  const assignedActiveStudents = new Set<string>()

  for (const group of groups) {
    if (group.memberIds.length === 0) {
      emptyGroups.add(group.id)
    }

    for (const memberId of group.memberIds) {
      const member = memberLookup.get(memberId)
      if (member === undefined || member.status !== "active") {
        continue
      }

      assignedActiveStudents.add(member.id)
      memberGroupCounts.set(
        member.id,
        (memberGroupCounts.get(member.id) ?? 0) + 1,
      )

      if (identityMode !== "username") {
        continue
      }

      if ((member.gitUsername ?? "").trim().length === 0) {
        missingGitUsernames.add(member.id)
      } else if (member.gitUsernameStatus === "invalid") {
        invalidGitUsernames.add(member.id)
      }
    }
  }

  const duplicateMembers = sortedStrings(
    [...memberGroupCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([memberId]) => memberId),
  )
  if (duplicateMembers.length > 0) {
    issues.push({
      kind: "student_in_multiple_groups_in_assignment",
      affectedIds: duplicateMembers,
      context: null,
    })
  }

  if (emptyGroups.size > 0) {
    issues.push({
      kind: "empty_group",
      affectedIds: sortedStrings([...emptyGroups]),
      context: null,
    })
  }

  if (identityMode === "username" && missingGitUsernames.size > 0) {
    issues.push({
      kind: "missing_git_username",
      affectedIds: sortedStrings([...missingGitUsernames]),
      context: null,
    })
  }

  if (identityMode === "username" && invalidGitUsernames.size > 0) {
    issues.push({
      kind: "invalid_git_username",
      affectedIds: sortedStrings([...invalidGitUsernames]),
      context: null,
    })
  }

  const unassignedActiveStudents = roster.students
    .filter((member) => member.status === "active")
    .filter((member) => !assignedActiveStudents.has(member.id))
    .map((member) => member.id)
  if (unassignedActiveStudents.length > 0) {
    issues.push({
      kind: "unassigned_student",
      affectedIds: sortedStrings(unassignedActiveStudents),
      context: null,
    })
  }

  const repoNameMap = new Map<string, string[]>()
  for (const group of groups) {
    const repoName = computeRepoName(template, assignment, group, {
      members: activeGroupGitUsernameToken(group.memberIds, memberLookup),
    })
    repoNameMap.set(repoName, [...(repoNameMap.get(repoName) ?? []), group.id])
  }

  for (const [repoName, groupIds] of repoNameMap) {
    if (groupIds.length <= 1) {
      continue
    }
    issues.push({
      kind: "duplicate_repo_name_in_assignment",
      affectedIds: sortedStrings(groupIds),
      context: repoName,
    })
  }

  return { issues }
}

export function isBlockingValidationKind(kind: RosterValidationKind): boolean {
  switch (kind) {
    case "duplicate_student_id":
    case "invalid_email":
    case "duplicate_email":
    case "duplicate_assignment_name":
    case "duplicate_group_id_in_assignment":
    case "duplicate_group_name_in_assignment":
    case "duplicate_repo_name_in_assignment":
    case "orphan_group_member":
    case "empty_group":
    case "system_group_sets_missing":
    case "invalid_enrollment_partition":
    case "invalid_group_origin":
      return true
    case "missing_email":
    case "missing_git_username":
    case "invalid_git_username":
    case "unassigned_student":
    case "student_in_multiple_groups_in_assignment":
      return false
  }
}

export function hasBlockingIssues(result: RosterValidationResult): boolean {
  return result.issues.some((issue) => isBlockingValidationKind(issue.kind))
}

export function blockingIssues(
  result: RosterValidationResult,
): RosterValidationIssue[] {
  return result.issues.filter((issue) => isBlockingValidationKind(issue.kind))
}

export function warningIssues(
  result: RosterValidationResult,
): RosterValidationIssue[] {
  return result.issues.filter((issue) => !isBlockingValidationKind(issue.kind))
}
