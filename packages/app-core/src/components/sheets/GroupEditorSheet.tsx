/**
 * Sheet for viewing and editing groups within an assignment.
 */

import type { Group, GroupId, Student } from "@repo-edu/backend-interface/types"
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import { useMemo, useState } from "react"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function GroupEditorSheet() {
  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const removeGroup = useRosterStore((state) => state.removeGroup)
  const open = useUiStore((state) => state.groupEditorOpen)
  const setOpen = useUiStore((state) => state.setGroupEditorOpen)
  const setAddGroupDialogOpen = useUiStore(
    (state) => state.setAddGroupDialogOpen,
  )
  const setEditGroupDialogOpen = useUiStore(
    (state) => state.setEditGroupDialogOpen,
  )
  const setEditingGroupId = useUiStore((state) => state.setEditingGroupId)

  const [searchQuery, setSearchQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<GroupId>>(new Set())

  const assignment = roster?.assignments.find(
    (a) => a.id === selectedAssignmentId,
  )
  const groups = assignment?.groups ?? []
  const students = roster?.students ?? []

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col bg-background h-full">
        <SheetHeader>
          <SheetTitle>Groups: {assignment?.name ?? "No assignment"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 py-4 overflow-hidden">
          {/* Search and Add button */}
          <div className="flex gap-2">
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
          <div className="flex-1 overflow-y-auto space-y-2">
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
                  students={students}
                  expanded={expandedGroups.has(group.id)}
                  onToggle={() => toggleExpand(group.id)}
                  onEdit={() => handleEditGroup(group.id)}
                  onRemove={() => handleRemoveGroup(group.id)}
                />
              ))
            )}
          </div>
        </div>

        <SheetFooter className="border-t pt-4">
          <div className="flex-1 text-muted-foreground">
            {groups.length} group{groups.length !== 1 ? "s" : ""} -{" "}
            {totalStudents} student{totalStudents !== 1 ? "s" : ""}
            {emptyGroupCount > 0 && (
              <span className="text-warning ml-2">
                - {emptyGroupCount} empty
              </span>
            )}
          </div>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

interface GroupListItemProps {
  group: Group
  students: Student[]
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}

function GroupListItem({
  group,
  students,
  expanded,
  onToggle,
  onEdit,
  onRemove,
}: GroupListItemProps) {
  const members = group.member_ids
    .map((id) => students.find((s) => s.id === id))
    .filter(Boolean) as Student[]

  const isEmpty = members.length === 0

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
          {isEmpty && (
            <span className="text-warning text-xs" title="Empty group">
              ⚠
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
            <span>{members.map((m) => m.name).join(", ")}</span>
          )}
        </div>
      )}
    </div>
  )
}
