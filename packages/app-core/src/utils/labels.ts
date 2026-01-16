import type {
  AssignmentType,
  StudentStatus,
} from "@repo-edu/backend-interface/types"

export const formatAssignmentType = (type: AssignmentType) =>
  type === "class_wide" ? "class-wide" : "selective"

export const formatStudentStatus = (status: StudentStatus) => {
  switch (status) {
    case "active":
      return "Active"
    case "dropped":
      return "Dropped"
    case "incomplete":
      return "Incomplete"
    default:
      return "Active"
  }
}
