/**
 * AssignmentSidebar - Left sidebar showing all assignments with inline actions.
 */

import type {
  Assignment,
  AssignmentId,
} from "@repo-edu/backend-interface/types"
import { AlertTriangle, Pencil, Trash2 } from "@repo-edu/ui/components/icons"
import { SidebarNav, type SidebarNavItem } from "../../SidebarNav"

interface AssignmentNavItem extends SidebarNavItem {
  id: AssignmentId
  hasWarning: boolean
}

interface AssignmentSidebarProps {
  assignments: Assignment[]
  selectedId: AssignmentId | null
  onSelect: (id: AssignmentId) => void
  onNew: () => void
  onEdit: (id: AssignmentId) => void
  onDelete: (id: AssignmentId) => void
}

export function AssignmentSidebar({
  assignments,
  selectedId,
  onSelect,
  onNew,
  onEdit,
  onDelete,
}: AssignmentSidebarProps) {
  const items: AssignmentNavItem[] = assignments.map((assignment) => ({
    id: assignment.id,
    label: assignment.name,
    hasWarning:
      assignment.assignment_type === "class_wide" &&
      assignment.groups.some((g) => g.member_ids.length === 0),
  }))

  return (
    <SidebarNav
      title="Assignments"
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      className="w-52"
      actionMode="dropdown"
      actions={[
        {
          icon: <Pencil className="size-3" />,
          onClick: onEdit,
          label: "Edit",
        },
        {
          icon: <Trash2 className="size-3" />,
          onClick: onDelete,
          label: "Delete",
        },
      ]}
      addNew={{
        label: "New Assignment",
        onClick: onNew,
      }}
      renderWarning={(item) =>
        item.hasWarning ? (
          <AlertTriangle
            className="size-3 text-warning shrink-0"
            aria-label="Issues detected"
          />
        ) : null
      }
    />
  )
}
