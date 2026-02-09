import type { MemberStatus } from "@repo-edu/backend-interface/types"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@repo-edu/ui"
import { formatStudentStatus } from "../../../../utils/labels"

interface StatusSelectCellProps {
  status: MemberStatus
  onChange: (status: MemberStatus) => void
}

export function StatusSelectCell({ status, onChange }: StatusSelectCellProps) {
  return (
    <Select
      value={status}
      onValueChange={(value) => onChange(value as MemberStatus)}
    >
      <SelectTrigger className="h-7 w-32">
        <span className="text-sm">{formatStudentStatus(status)}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="dropped">Dropped</SelectItem>
        <SelectItem value="incomplete">Incomplete</SelectItem>
      </SelectContent>
    </Select>
  )
}
