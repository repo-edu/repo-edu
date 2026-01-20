/**
 * GroupsPane - Main body showing groups for the selected assignment.
 * Extracted from GroupEditorSheet to display inline in the Assignment tab.
 */

import type {
  Assignment,
  Group,
  GroupId,
  Student,
} from "@repo-edu/backend-interface/types"
import { Button, Input } from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { useProfileStore } from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"
import { formatStudentStatus } from "../../../utils/labels"
import { getAssignmentCoverageSummary } from "../../../utils/rosterMetrics"

interface GroupsPaneProps {
  assignment: Assignment | null
  students: Student[]
  onImportGroups: () => void
  onFileImportExport: () => void
}

export function GroupsPane({
  assignment,
  students,
  onImportGroups,
  onFileImportExport,
}: GroupsPaneProps) {
  const removeGroup = useProfileStore((state) => state.removeGroup)
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId =
    assignmentSelection?.mode === "assignment" ? assignmentSelection.id : null
  const setAddGroupDialogOpen = useUiStore(
    (state) => state.setAddGroupDialogOpen,
  )
  const setEditGroupDialogOpen = useUiStore(
    (state) => state.setEditGroupDialogOpen,
  )
  const setEditingGroupId = useUiStore((state) => state.setEditingGroupId)

  const [searchQuery, setSearchQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<GroupId>>(new Set())

  const groups = assignment?.groups ?? []
  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter((group) => {
      // Match group name
      if (group.name.toLowerCase().includes(query)) return true
      // Match member names
      const members = group.member_ids
        .map((id) => students.find((s) => s.id === id))
        .filter(Boolean) as Student[]
      return members.some((m) => m.name.toLowerCase().includes(query))
    })
  }, [groups, searchQuery, students])

  const toggleExpand = (groupId: GroupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const handleEditGroup = (groupId: GroupId) => {
    setEditingGroupId(groupId)
    setEditGroupDialogOpen(true)
  }

  const handleRemoveGroup = (groupId: GroupId) => {
    if (selectedAssignmentId) {
      removeGroup(selectedAssignmentId, groupId)
    }
  }

  // Calculate summary stats
  const totalStudents = groups.reduce((acc, g) => acc + g.member_ids.length, 0)
  const emptyGroupCount = groups.filter((g) => g.member_ids.length === 0).length
  const coverage = assignment
    ? getAssignmentCoverageSummary(assignment, students)
    : null

  if (!assignment) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an assignment to view groups
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Groups
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onImportGroups}>
            Import Groups
          </Button>
          <Button size="sm" variant="outline" onClick={onFileImportExport}>
            File Import/Export...
          </Button>
        </div>
      </div>

      {/* Search and Add */}
      <div className="flex gap-2 px-3 py-2">
        <Input
          placeholder="Search groups or members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button size="sm" onClick={() => setAddGroupDialogOpen(true)}>
          + Add
        </Button>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {filteredGroups.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            {groups.length === 0
              ? "No groups yet. Add a group or import from LMS."
              : "No groups match your search."}
          </p>
        ) : (
          filteredGroups.map((group) => (
            <GroupListItem
              key={group.id}
              group={group}
              studentMap={studentMap}
              expanded={expandedGroups.has(group.id)}
              onToggle={() => toggleExpand(group.id)}
              onEdit={() => handleEditGroup(group.id)}
              onRemove={() => handleRemoveGroup(group.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t text-sm text-muted-foreground">
        {groups.length} group{groups.length !== 1 ? "s" : ""} · {totalStudents}{" "}
        student{totalStudents !== 1 ? "s" : ""}
        {emptyGroupCount > 0 && <span> · {emptyGroupCount} empty</span>}
        {coverage && (
          <span>
            {" "}
            · {coverage.assignedActiveCount}/{coverage.activeCount} active
            {assignment?.assignment_type === "class_wide" &&
              coverage.unassignedActiveStudents.length > 0 && (
                <span className="text-warning">
                  {" "}
                  · {coverage.unassignedActiveStudents.length} unassigned
                </span>
              )}
          </span>
        )}
      </div>
    </div>
  )
}

interface GroupListItemProps {
  group: Group
  studentMap: Map<string, Student>
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}

function GroupListItem({
  group,
  studentMap,
  expanded,
  onToggle,
  onEdit,
  onRemove,
}: GroupListItemProps) {
  const members = group.member_ids.map((id) => {
    const student = studentMap.get(id)
    return {
      id,
      name: student?.name ?? `Unknown (${id})`,
      status: student?.status ?? null,
      isUnknown: !student,
    }
  })

  const hasUnknown = members.some((member) => member.isUnknown)

  return (
    <div className="border rounded-md">
      <div className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/50">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 text-left cursor-pointer bg-transparent border-0 p-0"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="text-xs w-4">{expanded ? "▼" : "▶"}</span>
          <span className="flex-1 font-medium">
            {group.name}
            <span className="text-muted-foreground font-normal ml-1">
              ({members.length} student{members.length !== 1 ? "s" : ""})
            </span>
          </span>
          {hasUnknown && (
            <span
              className="inline-flex"
              title="Unknown student IDs in this group"
            >
              <AlertTriangle
                className="size-3 text-warning"
                aria-hidden="true"
              />
            </span>
          )}
        </button>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onRemove}
          >
            ×
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-muted/30 border-t">
          {members.length === 0 ? (
            <span className="text-muted-foreground italic">No members</span>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              {members.map((member) => (
                <span
                  key={member.id}
                  className={
                    member.isUnknown
                      ? "text-warning"
                      : member.status && member.status !== "active"
                        ? "text-muted-foreground"
                        : ""
                  }
                >
                  {member.name}
                  {member.status && member.status !== "active"
                    ? ` (${formatStudentStatus(member.status)})`
                    : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
