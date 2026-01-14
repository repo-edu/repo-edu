/**
 * AssignmentTab - assignment management with group operations.
 */

import {
  Alert,
  AlertDescription,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { commands } from "../../bindings/commands"
import { saveDialog } from "../../services/platform"
import { useOutputStore } from "../../stores/outputStore"
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
    <EmptyState message="No assignments yet">
      <Button onClick={() => setNewAssignmentDialogOpen(true)}>
        Create Assignment
      </Button>
    </EmptyState>
  )
}

interface AssignmentSelectorProps {
  assignments: { id: string; name: string; description?: string | null }[]
  selected: string | null
  onSelect: (id: string | null) => void
}

function AssignmentSelector({
  assignments,
  selected,
  onSelect,
}: AssignmentSelectorProps) {
  const selectedAssignment = assignments.find((a) => a.id === selected)

  return (
    <Select
      value={selected ?? undefined}
      onValueChange={(val) => onSelect(val || null)}
    >
      <SelectTrigger
        className="w-64"
        title="Select the assignment to operate on. The assignment name is used as part of the repository name."
      >
        <span className="flex flex-col items-start truncate text-left">
          {selectedAssignment ? (
            <>
              <span className="truncate">{selectedAssignment.name}</span>
              {selectedAssignment.description && (
                <span className="text-[10px] text-muted-foreground font-normal truncate">
                  {selectedAssignment.description}
                </span>
              )}
            </>
          ) : (
            <span>Select assignment</span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        {assignments.map((a) => (
          <SelectItem key={a.id} value={a.id} className="py-1.5">
            <span className="flex flex-col">
              <span>{a.name}</span>
              {a.description && (
                <span className="text-[10px] text-muted-foreground">
                  {a.description}
                </span>
              )}
            </span>
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
  const setImportGroupsFromFileDialogOpen = useUiStore(
    (state) => state.setImportGroupsFromFileDialogOpen,
  )
  const setExportSettingsOpen = useUiStore(
    (state) => state.setExportSettingsOpen,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)
  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const appendOutput = useOutputStore((state) => state.appendText)
  const canImportGroupsFromFile = Boolean(roster?.students.length)

  const handleExportGroups = async (format: "csv" | "xlsx") => {
    if (!roster || !selectedAssignmentId) return

    try {
      const path = await saveDialog({
        defaultPath: `assignment-groups.${format}`,
        filters: [
          {
            name: format === "csv" ? "CSV files" : "Excel files",
            extensions: [format],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportGroupsForEdit(
        roster,
        selectedAssignmentId,
        path,
      )
      if (result.status === "ok") {
        appendOutput(`Groups exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  const handleExportTeams = async () => {
    if (!roster || !selectedAssignmentId) return
    if (!activeProfile) {
      appendOutput("No active profile selected.", "warning")
      return
    }

    try {
      const path = await saveDialog({
        defaultPath: "teams.yaml",
        filters: [
          {
            name: "YAML files",
            extensions: ["yaml", "yml"],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportTeams(
        activeProfile,
        roster,
        selectedAssignmentId,
        path,
      )
      if (result.status === "ok") {
        appendOutput(`Teams exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  const handleExportAssignmentStudents = async (format: "csv" | "xlsx") => {
    if (!roster || !selectedAssignmentId) return

    try {
      const path = await saveDialog({
        defaultPath: `assignment-students.${format}`,
        filters: [
          {
            name: format === "csv" ? "CSV files" : "Excel files",
            extensions: [format],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportAssignmentStudents(
        roster,
        selectedAssignmentId,
        path,
      )
      if (result.status === "ok") {
        appendOutput(`Assignment students exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {!canImportGroupsFromFile && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Import students first in the Roster tab so group imports can match
            by student_id or email.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportGroupsDialogOpen(true)}
          title="Import group assignments from your LMS. Groups define which students work together on an assignment."
        >
          Import Groups
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportGroupsFromFileDialogOpen(true)}
          title={
            canImportGroupsFromFile
              ? "Import groups from CSV/XLSX (round-trip if group_id exists; otherwise create new groups)."
              : "Import students first (Roster tab) so groups can match by student_id/email."
          }
          disabled={!canImportGroupsFromFile}
        >
          Import Groups (File)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setGroupEditorOpen(true)}
          title="View and manually edit group membership."
        >
          View/Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              title="Export assignment-specific data. Groups CSV/XLSX supports round-trip editing; Teams YAML is for RepoBee."
            >
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleExportGroups("csv")}>
              Groups (CSV, editable)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportGroups("xlsx")}>
              Groups (XLSX, editable)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportTeams}>
              Teams (YAML, RepoBee)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExportAssignmentStudents("csv")}
            >
              Assignment Students (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExportAssignmentStudents("xlsx")}
            >
              Assignment Students (XLSX)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setExportSettingsOpen(true)}>
              Export Settings...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
