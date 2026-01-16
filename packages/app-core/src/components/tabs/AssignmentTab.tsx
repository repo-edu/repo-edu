/**
 * AssignmentTab - assignment management with group operations.
 */

import type {
  Assignment,
  AssignmentId,
} from "@repo-edu/backend-interface/types"
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
import { useMemo } from "react"
import { commands } from "../../bindings/commands"
import { saveDialog } from "../../services/platform"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { formatAssignmentType } from "../../utils/labels"
import {
  type AssignmentCoverageSummary,
  getAssignmentCoverageSummary,
} from "../../utils/rosterMetrics"

export function AssignmentTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const selectedAssignmentId = useProfileStore(
    (state) => state.selectedAssignmentId,
  )
  const selectAssignment = useProfileStore((state) => state.selectAssignment)
  const assignmentValidation = useProfileStore(
    (state) => state.assignmentValidation,
  )

  const assignments = roster?.assignments ?? []
  const students = roster?.students ?? []
  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId,
  )
  const coverageByAssignment = useMemo(() => {
    const map = new Map<AssignmentId, AssignmentCoverageSummary>()
    for (const assignment of assignments) {
      map.set(assignment.id, getAssignmentCoverageSummary(assignment, students))
    }
    return map
  }, [assignments, students])

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
          coverageByAssignment={coverageByAssignment}
        />
        <AssignmentCrudButtons />
      </div>

      {selectedAssignment && (
        <>
          {/* Group summary */}
          <GroupSummary
            assignment={selectedAssignment}
            coverage={coverageByAssignment.get(selectedAssignment.id) ?? null}
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
  assignments: Assignment[]
  selected: AssignmentId | null
  onSelect: (id: AssignmentId | null) => void
  coverageByAssignment: Map<AssignmentId, AssignmentCoverageSummary>
}

function AssignmentSelector({
  assignments,
  selected,
  onSelect,
  coverageByAssignment,
}: AssignmentSelectorProps) {
  const selectedAssignment = assignments.find((a) => a.id === selected)
  const selectedCoverage = selectedAssignment
    ? (coverageByAssignment.get(selectedAssignment.id) ?? null)
    : null
  const unassignedCount = selectedCoverage?.unassignedActiveStudents.length ?? 0
  const showWarning =
    selectedAssignment?.assignment_type === "class_wide" && unassignedCount > 0

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
              <span className="truncate flex items-center gap-2">
                {selectedAssignment.name}
                {showWarning && (
                  <span
                    className="inline-flex"
                    title={`${unassignedCount} active students unassigned`}
                  >
                    <AlertTriangle
                      className="size-3 text-warning"
                      aria-hidden="true"
                    />
                  </span>
                )}
              </span>
              {selectedAssignment.description && (
                <span className="text-[10px] text-muted-foreground font-normal truncate">
                  {selectedAssignment.description}
                </span>
              )}
              {selectedCoverage && (
                <span className="text-[10px] text-muted-foreground font-normal truncate">
                  {formatAssignmentType(selectedAssignment.assignment_type)} ·{" "}
                  {selectedCoverage.assignedActiveCount}/
                  {selectedCoverage.activeCount} active
                </span>
              )}
            </>
          ) : (
            <span>Select assignment</span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        {assignments.map((a) => {
          const coverage = coverageByAssignment.get(a.id)
          const assignmentUnassigned =
            coverage?.unassignedActiveStudents.length ?? 0
          const assignmentWarning =
            a.assignment_type === "class_wide" && assignmentUnassigned > 0
          return (
            <SelectItem key={a.id} value={a.id} className="py-1.5">
              <span className="flex flex-col">
                <span className="flex items-center gap-2">
                  {a.name}
                  {assignmentWarning && (
                    <span
                      className="inline-flex"
                      title={`${assignmentUnassigned} active students unassigned`}
                    >
                      <AlertTriangle
                        className="size-3 text-warning"
                        aria-hidden="true"
                      />
                    </span>
                  )}
                </span>
                {a.description && (
                  <span className="text-[10px] text-muted-foreground">
                    {a.description}
                  </span>
                )}
                {coverage && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatAssignmentType(a.assignment_type)} ·{" "}
                    {coverage.assignedActiveCount}/{coverage.activeCount} active
                  </span>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

function AssignmentCrudButtons() {
  const selectedAssignmentId = useProfileStore(
    (state) => state.selectedAssignmentId,
  )
  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setEditAssignmentDialogOpen = useUiStore(
    (state) => state.setEditAssignmentDialogOpen,
  )
  const removeAssignment = useProfileStore((state) => state.removeAssignment)
  const assignments = useProfileStore(
    (state) => state.document?.roster?.assignments ?? [],
  )
  const addToast = useToastStore((state) => state.addToast)

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
        onClick={() => {
          const assignment = assignments.find(
            (a) => a.id === selectedAssignmentId,
          )
          if (!selectedAssignmentId || !assignment) return
          removeAssignment(selectedAssignmentId)
          addToast(`Deleted ${assignment.name}. Ctrl+Z to undo`, {
            tone: "warning",
          })
        }}
        disabled={!selectedAssignmentId}
      >
        Delete
      </Button>
    </div>
  )
}

interface GroupSummaryProps {
  assignment: Assignment
  coverage: AssignmentCoverageSummary | null
  validation: { issues: { kind: string; affected_ids: string[] }[] } | null
}

function GroupSummary({ assignment, coverage, validation }: GroupSummaryProps) {
  const setAssignmentCoverageOpen = useUiStore(
    (state) => state.setAssignmentCoverageOpen,
  )
  const setAssignmentCoverageFocus = useUiStore(
    (state) => state.setAssignmentCoverageFocus,
  )

  const groupCount = assignment.groups.length
  const studentCount = assignment.groups.reduce(
    (acc, g) => acc + g.member_ids.length,
    0,
  )
  const unassignedCount = coverage?.unassignedActiveStudents.length ?? 0
  const hasUnassigned =
    assignment.assignment_type === "class_wide" && unassignedCount > 0
  const activeTotal = coverage?.activeCount ?? 0
  const assignedActive = coverage?.assignedActiveCount ?? 0

  return (
    <div className="space-y-1">
      <div>
        <span>
          {groupCount} group{groupCount !== 1 ? "s" : ""}
        </span>
        <span className="mx-2">-</span>
        <span>{studentCount} students</span>
      </div>
      {coverage && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            className="text-primary hover:underline inline-flex items-center gap-1"
            onClick={() => {
              setAssignmentCoverageFocus(null)
              setAssignmentCoverageOpen(true)
            }}
            title="View coverage details"
          >
            {assignedActive}/{activeTotal} active
            <span aria-hidden="true">›</span>
          </button>
          {assignment.assignment_type === "class_wide" ? (
            hasUnassigned ? (
              <span
                className="text-warning inline-flex items-center gap-1"
                title={`${unassignedCount} active students unassigned`}
              >
                <AlertTriangle className="size-3" />
                {unassignedCount} unassigned
              </span>
            ) : (
              <span className="text-muted-foreground">All active assigned</span>
            )
          ) : (
            <span className="text-muted-foreground">Selective assignment</span>
          )}
        </div>
      )}
      {validation?.issues.length ? (
        <div className="text-muted-foreground text-xs">
          {validation.issues.length} validation signal
          {validation.issues.length > 1 ? "s" : ""}
        </div>
      ) : null}
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
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const selectedAssignmentId = useProfileStore(
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
