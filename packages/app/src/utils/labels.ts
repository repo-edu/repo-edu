import type { MemberStatus } from "@repo-edu/domain"

export function formatMemberStatus(status: MemberStatus): string {
  switch (status) {
    case "active":
      return "Active"
    case "dropped":
      return "Dropped"
    case "incomplete":
      return "Incomplete"
  }
}
