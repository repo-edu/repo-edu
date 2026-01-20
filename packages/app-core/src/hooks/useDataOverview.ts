import type {
  Assignment,
  AssignmentId,
  Student,
  ValidationIssue,
  ValidationKind,
} from "@repo-edu/backend-interface/types"
import { useMemo } from "react"
import {
  selectAssignmentValidations,
  useProfileStore,
} from "../stores/profileStore"
import {
  buildStudentMap,
  getActiveStudents,
  getAssignmentCoverageSummary,
} from "../utils/rosterMetrics"

type StudentMap = Map<string, Student>

export interface IssueSummaryItem {
  key: string
  label: string
  count: number
}

export interface IssueCard {
  id: string
  kind:
    | "unknown_students"
    | "unassigned_students"
    | "empty_groups"
    | "roster_validation"
    | "assignment_validation"
  assignmentId?: AssignmentId
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

export function useDataOverview() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const rosterValidation = useProfileStore((state) => state.rosterValidation)
  const assignmentValidations = useProfileStore(selectAssignmentValidations)

  return useMemo(() => {
    if (!roster) {
      return {
        issueSummary: [] as IssueSummaryItem[],
        issueCards: [] as IssueCard[],
        rosterInsights: null as RosterInsights | null,
      }
    }

    const students = roster.students
    const assignments = roster.assignments
    const studentMap = buildStudentMap(students)
    const activeStudents = getActiveStudents(students)

    const rosterInsights: RosterInsights = {
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

    const issueCards: IssueCard[] = []

    const rosterIssues = rosterValidation?.issues ?? []
    for (const issue of rosterIssues) {
      if (!ROSTER_ISSUE_KINDS.includes(issue.kind)) continue
      issueCards.push(buildRosterIssueCard(issue, studentMap))
    }

    const assignmentById = new Map<string, Assignment>(
      assignments.map((assignment) => [assignment.id, assignment]),
    )

    for (const [assignmentId, validation] of Object.entries(
      assignmentValidations,
    )) {
      const assignment = assignmentById.get(assignmentId)
      if (!assignment) continue
      for (const issue of validation.issues) {
        if (!ASSIGNMENT_ISSUE_KINDS.includes(issue.kind)) continue
        issueCards.push(buildAssignmentIssueCard(assignment, issue))
      }
    }

    for (const assignment of assignments) {
      const unknownGroups: { groupName: string; unknownIds: string[] }[] = []
      const emptyGroups: string[] = []

      for (const group of assignment.groups) {
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
          id: `unknown-${assignment.id}`,
          kind: "unknown_students",
          assignmentId: assignment.id,
          title: `${uniqueUnknownIds.size} unknown student${
            uniqueUnknownIds.size === 1 ? "" : "s"
          }`,
          description: assignment.name,
          count: uniqueUnknownIds.size,
          details: unknownGroups.map((group) => {
            return `${group.groupName}: ${formatDetailsList(group.unknownIds, 3)}`
          }),
        })
      }

      if (emptyGroups.length > 0) {
        issueCards.push({
          id: `empty-${assignment.id}`,
          kind: "empty_groups",
          assignmentId: assignment.id,
          title: `${emptyGroups.length} empty group${
            emptyGroups.length === 1 ? "" : "s"
          }`,
          description: assignment.name,
          count: emptyGroups.length,
          details: [formatDetailsList(emptyGroups, 3)],
        })
      }

      if (assignment.assignment_type === "class_wide") {
        const coverage = getAssignmentCoverageSummary(assignment, students)
        if (coverage.unassignedActiveStudents.length > 0) {
          const names = coverage.unassignedActiveStudents.map((s) => s.name)
          issueCards.push({
            id: `unassigned-${assignment.id}`,
            kind: "unassigned_students",
            assignmentId: assignment.id,
            title: `${coverage.unassignedActiveStudents.length} unassigned student${
              coverage.unassignedActiveStudents.length === 1 ? "" : "s"
            }`,
            description: assignment.name,
            count: coverage.unassignedActiveStudents.length,
            details: [formatDetailsList(names, 3)],
          })
        }
      }
    }

    const issueCounts: IssueSummaryItem[] = []

    const addSummary = (key: string, label: string, count: number) => {
      if (count > 0) {
        issueCounts.push({ key, label, count })
      }
    }

    const totalUnknown = issueCards
      .filter((issue) => issue.kind === "unknown_students")
      .reduce((acc, issue) => acc + issue.count, 0)
    const totalUnassigned = issueCards
      .filter((issue) => issue.kind === "unassigned_students")
      .reduce((acc, issue) => acc + issue.count, 0)
    const totalEmpty = issueCards
      .filter((issue) => issue.kind === "empty_groups")
      .reduce((acc, issue) => acc + issue.count, 0)

    addSummary("unknown", "unknown", totalUnknown)
    addSummary("unassigned", "unassigned", totalUnassigned)
    addSummary("empty", "empty", totalEmpty)

    const rosterIssueCounts = countIssueKinds(
      rosterIssues.filter((issue) => ROSTER_ISSUE_KINDS.includes(issue.kind)),
    )
    addSummary(
      "duplicate_ids",
      "duplicate IDs",
      rosterIssueCounts.duplicate_student_id ?? 0,
    )
    addSummary(
      "duplicate_emails",
      "duplicate emails",
      rosterIssueCounts.duplicate_email ?? 0,
    )
    addSummary(
      "invalid_emails",
      "invalid emails",
      rosterIssueCounts.invalid_email ?? 0,
    )
    addSummary(
      "missing_emails",
      "missing emails",
      rosterIssueCounts.missing_email ?? 0,
    )
    addSummary(
      "duplicate_assignments",
      "duplicate assignments",
      rosterIssueCounts.duplicate_assignment_name ?? 0,
    )

    const assignmentIssueCounts = countIssueKinds(
      Object.values(assignmentValidations)
        .flatMap((validation) => validation.issues)
        .filter((issue) => ASSIGNMENT_ISSUE_KINDS.includes(issue.kind)),
    )
    addSummary(
      "duplicate_groups",
      "duplicate groups",
      (assignmentIssueCounts.duplicate_group_id_in_assignment ?? 0) +
        (assignmentIssueCounts.duplicate_group_name_in_assignment ?? 0),
    )
    addSummary(
      "duplicate_repos",
      "duplicate repos",
      assignmentIssueCounts.duplicate_repo_name_in_assignment ?? 0,
    )

    const issueSummary = issueCounts.sort((a, b) => {
      const priorityOrder = [
        "unknown",
        "unassigned",
        "empty",
        "duplicate_ids",
        "invalid_emails",
        "missing_emails",
        "duplicate_emails",
        "duplicate_assignments",
        "duplicate_groups",
        "duplicate_repos",
      ]
      return priorityOrder.indexOf(a.key) - priorityOrder.indexOf(b.key)
    })

    return {
      issueSummary,
      issueCards: issueCards.sort((a, b) => b.count - a.count),
      rosterInsights,
    }
  }, [roster, rosterValidation, assignmentValidations])
}

/** Issue kinds where affected_ids are student IDs (not assignment/group names) */
const STUDENT_ID_ISSUE_KINDS: ValidationKind[] = [
  "duplicate_student_id",
  "duplicate_email",
  "invalid_email",
  "missing_email",
]

const buildRosterIssueCard = (
  issue: ValidationIssue,
  studentMap: StudentMap,
): IssueCard => {
  const count = issue.affected_ids.length
  const titleMap: Record<ValidationKind, string> = {
    duplicate_student_id: "Duplicate student IDs",
    duplicate_email: "Duplicate emails",
    invalid_email: "Invalid emails",
    duplicate_assignment_name: "Duplicate assignment names",
    duplicate_group_id_in_assignment: "Duplicate group IDs",
    duplicate_group_name_in_assignment: "Duplicate group names",
    duplicate_repo_name_in_assignment: "Duplicate repo names",
    student_in_multiple_groups_in_assignment: "Students in multiple groups",
    orphan_group_member: "Unknown students",
    missing_git_username: "Missing git usernames",
    invalid_git_username: "Invalid git usernames",
    empty_group: "Empty groups",
    unassigned_student: "Unassigned students",
    missing_email: "Missing emails",
    cached_group_resolution_pending: "Cached groups need re-resolution",
  }

  // For student-related issues, show names instead of IDs
  const displayItems = STUDENT_ID_ISSUE_KINDS.includes(issue.kind)
    ? issue.affected_ids.map((id) => studentMap.get(id)?.name ?? id)
    : issue.affected_ids

  return {
    id: `roster-${issue.kind}`,
    kind: "roster_validation",
    title: `${count} ${titleMap[issue.kind] ?? issue.kind}`,
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
): IssueCard => {
  const count = issue.affected_ids.length
  const titleMap: Record<ValidationKind, string> = {
    duplicate_student_id: "Duplicate student IDs",
    duplicate_email: "Duplicate emails",
    invalid_email: "Invalid emails",
    duplicate_assignment_name: "Duplicate assignment names",
    duplicate_group_id_in_assignment: "Duplicate group IDs",
    duplicate_group_name_in_assignment: "Duplicate group names",
    duplicate_repo_name_in_assignment: "Duplicate repo names",
    student_in_multiple_groups_in_assignment: "Students in multiple groups",
    orphan_group_member: "Unknown students",
    missing_git_username: "Missing git usernames",
    invalid_git_username: "Invalid git usernames",
    empty_group: "Empty groups",
    unassigned_student: "Unassigned students",
    missing_email: "Missing emails",
    cached_group_resolution_pending: "Cached groups need re-resolution",
  }

  return {
    id: `assignment-${assignment.id}-${issue.kind}`,
    kind: "assignment_validation",
    assignmentId: assignment.id,
    title: `${count} ${titleMap[issue.kind] ?? issue.kind}`,
    description: assignment.name,
    count,
    issueKind: issue.kind,
    details:
      issue.affected_ids.length > 0
        ? [formatDetailsList(issue.affected_ids, 3)]
        : undefined,
  }
}

/** Format a list with semicolon separators and count if truncated */
const formatDetailsList = (items: string[], limit: number): string => {
  const preview = items.slice(0, limit)
  const remainder = items.length - limit
  return preview.join("; ") + (remainder > 0 ? ` + ${remainder} more` : "")
}

const countIssueKinds = (issues: ValidationIssue[]) => {
  const counts: Partial<Record<ValidationKind, number>> = {}
  for (const issue of issues) {
    counts[issue.kind] = (counts[issue.kind] ?? 0) + issue.affected_ids.length
  }
  return counts
}
