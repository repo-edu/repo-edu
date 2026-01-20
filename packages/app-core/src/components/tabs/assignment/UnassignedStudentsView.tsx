/**
 * UnassignedStudentsView - Lists students not in any group set.
 *
 * Shows:
 * - List of active students not found in any cached group set
 * - Read-only informational view
 * - Note: This is group-set-only; assignments may differ
 */

import type {
  LmsGroupSetCacheEntry,
  Student,
} from "@repo-edu/backend-interface/types"
import { EmptyState, Text } from "@repo-edu/ui"
import { useMemo } from "react"

interface UnassignedStudentsViewProps {
  groupSets: LmsGroupSetCacheEntry[]
  students: Student[]
}

export function UnassignedStudentsView({
  groupSets,
  students,
}: UnassignedStudentsViewProps) {
  // Compute unassigned students
  const unassignedStudents = useMemo(() => {
    // Collect all student IDs that appear in any cached group
    const assignedStudentIds = new Set<string>()
    for (const groupSet of groupSets) {
      for (const group of groupSet.groups) {
        for (const memberId of group.resolved_member_ids) {
          assignedStudentIds.add(memberId)
        }
      }
    }

    // Filter to active students not in any group
    return students
      .filter((s) => s.status === "active" && !assignedStudentIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [groupSets, students])

  if (unassignedStudents.length === 0) {
    return (
      <EmptyState message="All students are assigned">
        <Text className="text-muted-foreground text-center">
          Every active student appears in at least one cached group set.
        </Text>
      </EmptyState>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Unassigned Students
        </span>
        <span className="text-xs text-muted-foreground">
          {unassignedStudents.length} unassigned
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {unassignedStudents.map((student) => (
          <div
            key={student.id}
            className="flex items-center gap-3 px-3 py-2 border rounded-md"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{student.name}</div>
              {student.email && (
                <div className="text-xs text-muted-foreground truncate">
                  {student.email}
                </div>
              )}
            </div>
            {student.lms_user_id && (
              <span className="text-xs text-muted-foreground shrink-0">
                LMS: {student.lms_user_id}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        Based on group set data only. Assignment snapshots may differ.
      </div>
    </div>
  )
}
