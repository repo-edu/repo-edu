/**
 * AssignmentSidebar - Left sidebar showing assignments.
 */

import type {
  Assignment,
  AssignmentId,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  EllipsisVertical,
  Pencil,
  Plus,
  Trash2,
} from "@repo-edu/ui/components/icons"
import type { AssignmentSelection } from "../../../stores/profileStore"

interface AssignmentSidebarProps {
  assignments: Assignment[]
  selection: AssignmentSelection | null
  onSelectAssignment: (id: AssignmentId) => void
  onNew: () => void
  onEdit: (id: AssignmentId) => void
  onDelete: (id: AssignmentId) => void
}

export function AssignmentSidebar({
  assignments,
  selection,
  onSelectAssignment,
  onNew,
  onEdit,
  onDelete,
}: AssignmentSidebarProps) {
  // Determine which item is selected
  const isAssignmentSelected = (id: AssignmentId) =>
    selection?.mode === "assignment" && selection.id === id

  return (
    <div className="flex flex-col h-full border-r w-52">
      <div className="flex items-center px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Assignments
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {/* Assignment items */}
          {assignments.map((assignment) => {
            const hasWarning =
              assignment.assignment_type === "class_wide" &&
              assignment.groups.some((g) => g.member_ids.length === 0)

            return (
              <li key={assignment.id}>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md transition-colors",
                    isAssignmentSelected(assignment.id)
                      ? "bg-blue-100 dark:bg-blue-700/60"
                      : "hover:bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectAssignment(assignment.id)}
                    className={cn(
                      "flex-1 flex items-center gap-2 px-3 py-2 text-left",
                      "bg-transparent border-0 cursor-pointer",
                    )}
                  >
                    <span className="truncate text-sm">{assignment.name}</span>
                    {hasWarning && (
                      <AlertTriangle
                        className="size-3 text-warning shrink-0"
                        aria-label="Issues detected"
                      />
                    )}
                  </button>

                  <div className="pr-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-5"
                          title="Actions"
                        >
                          <EllipsisVertical className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(assignment.id)}>
                          <span className="mr-2 size-4 flex items-center justify-center">
                            <Pencil className="size-3" />
                          </span>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete(assignment.id)}
                        >
                          <span className="mr-2 size-4 flex items-center justify-center">
                            <Trash2 className="size-3" />
                          </span>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            )
          })}

          {/* Add new assignment button */}
          <li>
            <button
              type="button"
              onClick={onNew}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm",
                "hover:bg-muted transition-colors",
              )}
            >
              <Plus className="size-4" />
              <span>New Assignment</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  )
}
