/**
 * AssignmentSidebar - Left sidebar showing aggregation views and assignments.
 *
 * Structure:
 * - All group sets (shows badge with count)
 * - Unused group sets (shows badge with count)
 * - Unassigned students (shows badge with count)
 * - Separator
 * - Assignment 1, Assignment 2, etc.
 */

import type {
  Assignment,
  AssignmentId,
  LmsGroupSetCacheEntry,
  Student,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Separator,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  EllipsisVertical,
  FolderMinus,
  Layers,
  Pencil,
  Plus,
  Trash2,
  UserX,
} from "@repo-edu/ui/components/icons"
import { useMemo } from "react"
import type { AssignmentSelection } from "../../../stores/profileStore"

interface AssignmentSidebarProps {
  assignments: Assignment[]
  lmsGroupSets: LmsGroupSetCacheEntry[]
  students: Student[]
  selection: AssignmentSelection | null
  onSelectAssignment: (id: AssignmentId) => void
  onSelectAggregation: (
    mode: "all-group-sets" | "unused-group-sets" | "unassigned-students",
  ) => void
  onNew: () => void
  onEdit: (id: AssignmentId) => void
  onDelete: (id: AssignmentId) => void
}

export function AssignmentSidebar({
  assignments,
  lmsGroupSets,
  students,
  selection,
  onSelectAssignment,
  onSelectAggregation,
  onNew,
  onEdit,
  onDelete,
}: AssignmentSidebarProps) {
  // Compute aggregation counts
  const { allGroupSetsCount, unusedGroupSetsCount, unassignedStudentsCount } =
    useMemo(() => {
      // All group sets = total cache entries
      const allCount = lmsGroupSets.length

      // Unused group sets = cache entries not referenced by any assignment
      const usedSetIds = new Set(
        assignments
          .map((a) => a.group_set_cache_id)
          .filter((id): id is string => id != null),
      )
      const unusedCount = lmsGroupSets.filter(
        (set) => !usedSetIds.has(set.id),
      ).length

      // Unassigned students = students not in any cached group
      const assignedStudentIds = new Set<string>()
      for (const groupSet of lmsGroupSets) {
        for (const group of groupSet.groups) {
          for (const memberId of group.resolved_member_ids) {
            assignedStudentIds.add(memberId)
          }
        }
      }
      const activeStudents = students.filter((s) => s.status === "active")
      const unassignedCount = activeStudents.filter(
        (s) => !assignedStudentIds.has(s.id),
      ).length

      return {
        allGroupSetsCount: allCount,
        unusedGroupSetsCount: unusedCount,
        unassignedStudentsCount: unassignedCount,
      }
    }, [lmsGroupSets, assignments, students])

  // Only show aggregation section if there are cached group sets
  const showAggregationSection = lmsGroupSets.length > 0

  // Determine which item is selected
  const isAggregationSelected = (
    mode: "all-group-sets" | "unused-group-sets" | "unassigned-students",
  ) => selection?.mode === mode

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
          {/* Aggregation items */}
          {showAggregationSection && (
            <>
              <AggregationItem
                icon={<Layers className="size-4" />}
                label="All group sets"
                count={allGroupSetsCount}
                selected={isAggregationSelected("all-group-sets")}
                onClick={() => onSelectAggregation("all-group-sets")}
              />
              <AggregationItem
                icon={<FolderMinus className="size-4" />}
                label="Unused group sets"
                count={unusedGroupSetsCount}
                selected={isAggregationSelected("unused-group-sets")}
                onClick={() => onSelectAggregation("unused-group-sets")}
              />
              <AggregationItem
                icon={<UserX className="size-4" />}
                label="Unassigned students"
                count={unassignedStudentsCount}
                selected={isAggregationSelected("unassigned-students")}
                onClick={() => onSelectAggregation("unassigned-students")}
              />

              {/* Separator */}
              <li className="py-2">
                <Separator />
              </li>
            </>
          )}

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

interface AggregationItemProps {
  icon: React.ReactNode
  label: string
  count: number
  selected: boolean
  onClick: () => void
}

function AggregationItem({
  icon,
  label,
  count,
  selected,
  onClick,
}: AggregationItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
          selected ? "bg-blue-100 dark:bg-blue-700/60" : "hover:bg-muted",
        )}
      >
        {icon}
        <span className="flex-1 truncate text-sm">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </button>
    </li>
  )
}
