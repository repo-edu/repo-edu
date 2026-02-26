import type {
  Assignment,
  AssignmentId,
  GroupSet,
  Roster,
  RosterMember,
  ValidationIssue,
  ValidationKind,
  ValidationResult,
} from "@repo-edu/backend-interface/types"
import {
  buildStudentMap,
  getActiveStudents,
  resolveGroupSetGroups,
} from "./rosterMetrics"

type StudentMap = Map<string, RosterMember>

export interface IssueCard {
  id: string
  kind:
    | "unknown_students"
    | "empty_groups"
    | "roster_validation"
    | "assignment_validation"
  assignmentId?: AssignmentId
  groupSetId?: string
  groupSetName?: string
  emptyGroupNames?: string[]
  title: string
  description?: string
  count: number
  details?: string[]
  issueKind?: ValidationKind
}

export interface RosterInsights {
  activeCount: number
  droppedCount: number
  incompleteCount: number
  missingEmailCount: number
  missingGitUsernameCount: number
}

const ROSTER_ISSUE_KINDS: ValidationKind[] = [
  "duplicate_student_id",
  "duplicate_email",
  "invalid_email",
  "missing_email",
  "duplicate_assignment_name",
]

const ASSIGNMENT_ISSUE_KINDS: ValidationKind[] = [
  "duplicate_group_id_in_assignment",
  "duplicate_group_name_in_assignment",
  "duplicate_repo_name_in_assignment",
]

/** Issue kinds where affected_ids are student IDs (not assignment/group names) */
const STUDENT_ID_ISSUE_KINDS: ValidationKind[] = [
  "duplicate_student_id",
  "duplicate_email",
  "invalid_email",
  "missing_email",
]

export function buildRosterInsights(roster: Roster): RosterInsights {
  const students = roster.students
  const activeStudents = getActiveStudents(students)

  return {
    activeCount: activeStudents.length,
    droppedCount: students.filter((student) => student.status === "dropped")
      .length,
    incompleteCount: students.filter(
      (student) => student.status === "incomplete",
    ).length,
    missingEmailCount: students.filter((student) => !student.email.trim())
      .length,
    missingGitUsernameCount: students.filter(
      (student) => !student.git_username?.trim(),
    ).length,
  }
}

export function buildIssueCards(
  roster: Roster,
  rosterValidation: ValidationResult | null,
  assignmentValidations: Record<AssignmentId, ValidationResult>,
): IssueCard[] {
  const members = [...roster.students, ...roster.staff]
  const assignments = roster.assignments
  const studentMap = buildStudentMap(members)
  const issueCards: IssueCard[] = []

  const rosterIssues = rosterValidation?.issues ?? []
  for (const issue of rosterIssues) {
    if (!ROSTER_ISSUE_KINDS.includes(issue.kind)) continue
    issueCards.push(buildRosterIssueCard(issue, studentMap))
  }

  const groupSetById = new Map<string, GroupSet>(
    roster.group_sets.map((groupSet) => [groupSet.id, groupSet]),
  )
  const assignmentById = new Map<string, Assignment>(
    assignments.map((assignment) => [assignment.id, assignment]),
  )

  for (const [assignmentId, validation] of Object.entries(
    assignmentValidations,
  )) {
    const assignment = assignmentById.get(assignmentId)
    if (!assignment) continue
    const groupSetName = groupSetById.get(assignment.group_set_id)?.name
    const description = groupSetName
      ? `${assignment.name} \u00b7 ${groupSetName}`
      : assignment.name
    for (const issue of validation.issues) {
      if (!ASSIGNMENT_ISSUE_KINDS.includes(issue.kind)) continue
      issueCards.push(buildAssignmentIssueCard(assignment, issue, description))
    }
  }

  const candidateGroupSets = roster.group_sets.filter(
    (groupSet) => groupSet.connection?.kind !== "system",
  )
  for (const groupSet of candidateGroupSets) {
    const groupSetId = groupSet.id

    const resolvedGroups = resolveGroupSetGroups(roster, groupSet)
    const unknownGroups: { groupName: string; unknownIds: string[] }[] = []
    const emptyGroups: string[] = []

    for (const group of resolvedGroups) {
      const unknownIds = group.member_ids.filter(
        (memberId) => !studentMap.has(memberId),
      )
      if (unknownIds.length > 0) {
        unknownGroups.push({ groupName: group.name, unknownIds })
      }
      if (group.member_ids.length === 0) {
        emptyGroups.push(group.name)
      }
    }

    const uniqueUnknownIds = new Set<string>()
    for (const group of unknownGroups) {
      for (const id of group.unknownIds) {
        uniqueUnknownIds.add(id)
      }
    }

    if (uniqueUnknownIds.size > 0) {
      issueCards.push({
        id: `unknown-${groupSetId}`,
        kind: "unknown_students",
        groupSetId,
        title: `${uniqueUnknownIds.size} unknown student${
          uniqueUnknownIds.size === 1 ? "" : "s"
        }`,
        description: groupSet.name,
        count: uniqueUnknownIds.size,
        details: unknownGroups.map((group) => {
          return `${group.groupName}: ${formatDetailsList(group.unknownIds, 3)}`
        }),
      })
    }

    if (emptyGroups.length > 0) {
      issueCards.push({
        id: `empty-${groupSetId}`,
        kind: "empty_groups",
        groupSetId,
        title: `${emptyGroups.length} empty group${
          emptyGroups.length === 1 ? "" : "s"
        }`,
        count: emptyGroups.length,
        groupSetName: groupSet.name,
        emptyGroupNames: emptyGroups,
      })
    }
  }

  return issueCards.sort((a, b) => b.count - a.count)
}

function validationKindLabel(kind: ValidationKind): string {
  switch (kind) {
    case "duplicate_student_id":
      return "Duplicate student IDs"
    case "duplicate_email":
      return "Duplicate emails"
    case "invalid_email":
      return "Invalid emails"
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
    case "missing_email":
      return "Missing emails"
    case "system_group_sets_missing":
      return "System group sets missing"
    case "invalid_enrollment_partition":
      return "Invalid enrollment partition"
    case "invalid_group_origin":
      return "Invalid group origin"
  }
}

const buildRosterIssueCard = (
  issue: ValidationIssue,
  studentMap: StudentMap,
): IssueCard => {
  const count = issue.affected_ids.length

  const displayItems = STUDENT_ID_ISSUE_KINDS.includes(issue.kind)
    ? issue.affected_ids.map((id) => studentMap.get(id)?.name ?? id)
    : issue.affected_ids

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

const buildAssignmentIssueCard = (
  assignment: Assignment,
  issue: ValidationIssue,
  description: string,
): IssueCard => {
  const count = issue.affected_ids.length

  return {
    id: `assignment-${assignment.id}-${issue.kind}`,
    kind: "assignment_validation",
    assignmentId: assignment.id,
    groupSetId: assignment.group_set_id,
    title: `${count} ${validationKindLabel(issue.kind)}`,
    description,
    count,
    issueKind: issue.kind,
    details:
      issue.affected_ids.length > 0
        ? [formatDetailsList(issue.affected_ids, 3)]
        : undefined,
  }
}

const formatDetailsList = (items: string[], maxShown: number): string => {
  if (items.length <= maxShown) return items.join(", ")
  const shown = items.slice(0, maxShown).join(", ")
  const remaining = items.length - maxShown
  return `${shown}, +${remaining} more`
}
