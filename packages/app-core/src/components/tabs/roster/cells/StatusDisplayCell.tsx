import type { MemberStatus } from "@repo-edu/backend-interface/types"
import { formatStudentStatus } from "../../../../utils/labels"

interface StatusDisplayCellProps {
  status: MemberStatus
}

export function StatusDisplayCell({ status }: StatusDisplayCellProps) {
  return <span className="text-sm">{formatStudentStatus(status)}</span>
}
