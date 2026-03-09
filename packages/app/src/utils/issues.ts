import type {
  Assignment,
  GroupSet,
  Roster,
  RosterMember,
  RosterValidationIssue,
  RosterValidationKind,
  RosterValidationResult,
} from "@repo-edu/domain"
import { activeMemberIds, resolveGroupsFromSelection } from "@repo-edu/domain"
import type { IssueCard, RosterInsights } from "../types/index.js"

type MemberMap = Map<string, RosterMember>

const ROSTER_ISSUE_KINDS: RosterValidationKind[] = [
  "duplicate_student_id",
  "duplicate_email",
  "invalid_email",
  "missing_email",
  "duplicate_assignment_name",
]

const ASSIGNMENT_ISSUE_KINDS: RosterValidationKind[] = [
  "duplicate_group_id_in_assignment",
  "duplicate_group_name_in_assignment",
  "duplicate_repo_name_in_assignment",
]

const STUDENT_ID_ISSUE_KINDS: RosterValidationKind[] = [
  "duplicate_student_id",
  "duplicate_email",
  "invalid_email",
  "missing_email",
]

function buildMemberMap(members: RosterMember[]): MemberMap {
  return new Map(members.map((member) => [member.id, member]))
}

export function buildRosterInsights(roster: Roster): RosterInsights {
  const students = roster.students
  const active = students.filter((s) => s.status === "active")

  return {
    activeCount: active.length,
    droppedCount: students.filter((s) => s.status === "dropped").length,
    incompleteCount: students.filter((s) => s.status === "incomplete").length,
    missingEmailCount: students.filter((s) => !s.email.trim()).length,
    missingGitUsernameCount: students.filter((s) => !s.gitUsername?.trim())
      .length,
  }
}

export function buildIssueCards(
  roster: Roster,
  rosterValidation: RosterValidationResult | null,
  assignmentValidations: Record<string, RosterValidationResult>,
): IssueCard[] {
  const members = [...roster.students, ...roster.staff]
  const memberMap = buildMemberMap(members)
  const issueCards: IssueCard[] = []

  const rosterIssues = rosterValidation?.issues ?? []
  for (const issue of rosterIssues) {
    if (!ROSTER_ISSUE_KINDS.includes(issue.kind)) continue
    issueCards.push(buildRosterIssueCard(issue, memberMap))
  }

  const groupSetById = new Map<string, GroupSet>(
    roster.groupSets.map((gs) => [gs.id, gs]),
  )
  const assignmentById = new Map<string, Assignment>(
    roster.assignments.map((a) => [a.id, a]),
  )

  for (const [assignmentId, validation] of Object.entries(
    assignmentValidations,
  )) {
    const assignment = assignmentById.get(assignmentId)
    if (!assignment) continue
    const groupSetName = groupSetById.get(assignment.groupSetId)?.name
    const description = groupSetName
      ? `${assignment.name} \u00b7 ${groupSetName}`
      : assignment.name
    for (const issue of validation.issues) {
      if (!ASSIGNMENT_ISSUE_KINDS.includes(issue.kind)) continue
      issueCards.push(buildAssignmentIssueCard(assignment, issue, description))
    }
  }

  const candidateGroupSets = roster.groupSets.filter(
    (gs) => gs.connection?.kind !== "system",
  )
  for (const groupSet of candidateGroupSets) {
    const resolvedGroups = resolveGroupsFromSelection(
      roster,
      groupSet,
      groupSet.groupSelection,
    )
    const unknownGroups: { groupName: string; unknownIds: string[] }[] = []
    const emptyGroups: string[] = []

    for (const group of resolvedGroups) {
      const activeIds = activeMemberIds(roster, group)
      const unknownIds = activeIds.filter((id) => !memberMap.has(id))
      if (unknownIds.length > 0) {
        unknownGroups.push({ groupName: group.name, unknownIds })
      }
      if (activeIds.length === 0) {
        emptyGroups.push(group.name)
      }
    }

    const uniqueUnknownIds = new Set<string>()
    for (const ug of unknownGroups) {
      for (const id of ug.unknownIds) {
        uniqueUnknownIds.add(id)
      }
    }

    if (uniqueUnknownIds.size > 0) {
      issueCards.push({
        id: `unknown-${groupSet.id}`,
        kind: "unknown_students",
        groupSetId: groupSet.id,
        title: `${uniqueUnknownIds.size} unknown student${uniqueUnknownIds.size === 1 ? "" : "s"}`,
        description: groupSet.name,
        count: uniqueUnknownIds.size,
        details: unknownGroups.map(
          (ug) => `${ug.groupName}: ${formatDetailsList(ug.unknownIds, 3)}`,
        ),
      })
    }

    if (emptyGroups.length > 0) {
      issueCards.push({
        id: `empty-${groupSet.id}`,
        kind: "empty_groups",
        groupSetId: groupSet.id,
        title: `${emptyGroups.length} empty group${emptyGroups.length === 1 ? "" : "s"}`,
        count: emptyGroups.length,
        groupSetName: groupSet.name,
        emptyGroupNames: emptyGroups,
      })
    }
  }

  return issueCards.sort((a, b) => b.count - a.count)
}

function validationKindLabel(kind: RosterValidationKind): string {
  switch (kind) {
    case "duplicate_student_id":
      return "Duplicate student IDs"
    case "duplicate_email":
      return "Duplicate emails"
    case "invalid_email":
      return "Invalid emails"
    case "missing_email":
      return "Missing emails"
    case "duplicate_assignment_name":
      return "Duplicate assignment names"
    case "duplicate_group_id_in_assignment":
      return "Duplicate group IDs"
    case "duplicate_group_name_in_assignment":
      return "Duplicate group names"
    case "duplicate_repo_name_in_assignment":
      return "Duplicate repo names"
    case "student_in_multiple_groups_in_assignment":
      return "Students in multiple groups"
    case "orphan_group_member":
      return "Unknown students"
    case "missing_git_username":
      return "Missing git usernames"
    case "invalid_git_username":
      return "Invalid git usernames"
    case "empty_group":
      return "Empty groups"
    case "unassigned_student":
      return "Unassigned students"
    case "system_group_sets_missing":
      return "System group sets missing"
    case "invalid_enrollment_partition":
      return "Invalid enrollment partition"
    case "invalid_group_origin":
      return "Invalid group origin"
  }
}

function buildRosterIssueCard(
  issue: RosterValidationIssue,
  memberMap: MemberMap,
): IssueCard {
  const count = issue.affectedIds.length
  const displayItems = STUDENT_ID_ISSUE_KINDS.includes(issue.kind)
    ? issue.affectedIds.map((id) => memberMap.get(id)?.name ?? id)
    : issue.affectedIds

  return {
    id: `roster-${issue.kind}`,
    kind: "roster_validation",
    title: `${count} ${validationKindLabel(issue.kind)}`,
    count,
    issueKind: issue.kind,
    details:
      displayItems.length > 0
        ? [formatDetailsList(displayItems, 3)]
        : undefined,
  }
}

function buildAssignmentIssueCard(
  assignment: Assignment,
  issue: RosterValidationIssue,
  description: string,
): IssueCard {
  const count = issue.affectedIds.length

  return {
    id: `assignment-${assignment.id}-${issue.kind}`,
    kind: "assignment_validation",
    assignmentId: assignment.id,
    groupSetId: assignment.groupSetId,
    title: `${count} ${validationKindLabel(issue.kind)}`,
    description,
    count,
    issueKind: issue.kind,
    details:
      issue.affectedIds.length > 0
        ? [formatDetailsList(issue.affectedIds, 3)]
        : undefined,
  }
}

function formatDetailsList(items: string[], maxShown: number): string {
  if (items.length <= maxShown) return items.join(", ")
  const shown = items.slice(0, maxShown).join(", ")
  const remaining = items.length - maxShown
  return `${shown}, +${remaining} more`
}
