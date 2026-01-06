/**
 * AssignmentTab - assignment management with group operations.
 */

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function AssignmentTab() {
  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const selectAssignment = useRosterStore((state) => state.selectAssignment)
  const assignmentValidation = useRosterStore(
    (state) => state.assignmentValidation,
  )

  const assignments = roster?.assignments ?? []
  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId,
  )

  // Empty state (no assignments)
  if (assignments.length === 0) {
    return <AssignmentEmptyState />
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Assignment selector + CRUD buttons */}
      <div className="flex items-center gap-2">
        <AssignmentSelector
          assignments={assignments}
          selected={selectedAssignmentId}
          onSelect={selectAssignment}
        />
        <AssignmentCrudButtons />
      </div>

      {selectedAssignment && (
        <>
          {/* Group summary */}
          <GroupSummary
            groups={selectedAssignment.groups}
            validation={assignmentValidation}
          />

          {/* Action buttons */}
          <AssignmentActions />
        </>
      )}
    </div>
  )
}

function AssignmentEmptyState() {
  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-muted-foreground">No assignments yet</p>
      <Button onClick={() => setNewAssignmentDialogOpen(true)}>
        Create Assignment
      </Button>
    </div>
  )
}

interface AssignmentSelectorProps {
  assignments: { id: string; name: string }[]
  selected: string | null
  onSelect: (id: string | null) => void
}

function AssignmentSelector({
  assignments,
  selected,
  onSelect,
}: AssignmentSelectorProps) {
  return (
    <Select
      value={selected ?? undefined}
      onValueChange={(val) => onSelect(val || null)}
    >
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Select assignment" />
      </SelectTrigger>
      <SelectContent>
        {assignments.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AssignmentCrudButtons() {
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setEditAssignmentDialogOpen = useUiStore(
    (state) => state.setEditAssignmentDialogOpen,
  )
  const setDeleteAssignmentDialogOpen = useUiStore(
    (state) => state.setDeleteAssignmentDialogOpen,
  )

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setNewAssignmentDialogOpen(true)}
      >
        + New
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setEditAssignmentDialogOpen(true)}
        disabled={!selectedAssignmentId}
      >
        Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDeleteAssignmentDialogOpen(true)}
        disabled={!selectedAssignmentId}
      >
        Delete
      </Button>
    </div>
  )
}

interface GroupSummaryProps {
  groups: { id: string; name: string; member_ids: string[] }[]
  validation: { issues: { kind: string; affected_ids: string[] }[] } | null
}

function GroupSummary({ groups, validation }: GroupSummaryProps) {
  const groupCount = groups.length
  const studentCount = groups.reduce((acc, g) => acc + g.member_ids.length, 0)
  const issueCount = validation?.issues.length ?? 0

  // Find specific warnings
  const emptyGroups = groups.filter((g) => g.member_ids.length === 0)

  return (
    <div>
      <span>
        {groupCount} group{groupCount !== 1 ? "s" : ""}
      </span>
      <span className="mx-2">-</span>
      <span>{studentCount} students</span>
      {issueCount > 0 && (
        <div className="text-warning mt-1">
          {issueCount} warning{issueCount > 1 ? "s" : ""}
          {emptyGroups.length > 0 && (
            <span className="ml-1">
              (empty group{emptyGroups.length > 1 ? "s" : ""}:{" "}
              {emptyGroups.map((g) => `"${g.name}"`).join(", ")})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function AssignmentActions() {
  const setGroupEditorOpen = useUiStore((state) => state.setGroupEditorOpen)
  const setImportGroupsDialogOpen = useUiStore(
    (state) => state.setImportGroupsDialogOpen,
  )
  const setExportSettingsOpen = useUiStore(
    (state) => state.setExportSettingsOpen,
  )

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setImportGroupsDialogOpen(true)}
      >
        Import Groups
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setGroupEditorOpen(true)}
      >
        View/Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled>Teams (YAML)</DropdownMenuItem>
          <DropdownMenuItem disabled>Students (CSV)</DropdownMenuItem>
          <DropdownMenuItem disabled>Students (XLSX)</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setExportSettingsOpen(true)}>
            Export Settings...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
