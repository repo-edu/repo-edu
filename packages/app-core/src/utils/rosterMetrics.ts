import type {
  Assignment,
  Student,
  StudentId,
} from "@repo-edu/backend-interface/types"

export interface AssignmentCoverageSummary {
  assignmentId: string
  activeCount: number
  assignedActiveCount: number
  unassignedActiveStudents: Student[]
}

export const isActiveStudent = (student: Student) => student.status === "active"

export const getActiveStudents = (students: Student[]) =>
  students.filter(isActiveStudent)

export const buildStudentMap = (students: Student[]) =>
  new Map<StudentId, Student>(students.map((student) => [student.id, student]))

export const buildGroupMembershipMap = (assignment: Assignment) => {
  const map = new Map<StudentId, string[]>()
  for (const group of assignment.groups) {
    for (const memberId of group.member_ids) {
      const existing = map.get(memberId) ?? []
      existing.push(group.name)
      map.set(memberId, existing)
    }
  }
  return map
}

export const getAssignmentCoverageSummary = (
  assignment: Assignment,
  students: Student[],
): AssignmentCoverageSummary => {
  const activeStudents = getActiveStudents(students)
  const studentMap = buildStudentMap(activeStudents)
  const assignedActiveIds = new Set<StudentId>()

  for (const group of assignment.groups) {
    for (const memberId of group.member_ids) {
      if (studentMap.has(memberId)) {
        assignedActiveIds.add(memberId)
      }
    }
  }

  const unassignedActiveStudents = activeStudents.filter(
    (student) => !assignedActiveIds.has(student.id),
  )

  return {
    assignmentId: assignment.id,
    activeCount: activeStudents.length,
    assignedActiveCount: assignedActiveIds.size,
    unassignedActiveStudents,
  }
}
