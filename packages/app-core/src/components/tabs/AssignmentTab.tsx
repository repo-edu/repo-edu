/**
 * AssignmentTab - assignment management with master-detail layout.
 * Left sidebar shows aggregation views and assignments, main body shows content for selection.
 */

import type { AssignmentId } from "@repo-edu/backend-interface/types"
import { Button, EmptyState } from "@repo-edu/ui"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { AssignmentSidebar, GroupsPane } from "./assignment"

export function AssignmentTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const setAssignmentSelection = useProfileStore(
    (state) => state.setAssignmentSelection,
  )
  const removeAssignment = useProfileStore((state) => state.removeAssignment)

  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setEditAssignmentDialogOpen = useUiStore(
    (state) => state.setEditAssignmentDialogOpen,
  )
  const setFileImportExportOpen = useUiStore(
    (state) => state.setFileImportExportOpen,
  )
  const addToast = useToastStore((state) => state.addToast)

  const assignments = roster?.assignments ?? []
  const students = roster?.students ?? []
  const lmsGroupSets = roster?.lms_group_sets ?? []

  const selectedAssignmentId = assignmentSelection?.id ?? null
  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId,
  )

  const handleSelectAssignment = (id: AssignmentId) => {
    setAssignmentSelection({ mode: "assignment", id })
  }

  const handleEditAssignment = (id: AssignmentId) => {
    setAssignmentSelection({ mode: "assignment", id })
    setEditAssignmentDialogOpen(true)
  }

  const handleDeleteAssignment = (id: AssignmentId) => {
    const assignment = assignments.find((a) => a.id === id)
    if (!assignment) return
    removeAssignment(id)
    addToast(`Deleted ${assignment.name}. Ctrl+Z to undo`, { tone: "warning" })
  }

  // Empty state (no assignments)
  if (assignments.length === 0) {
    return (
      <EmptyState message="No assignments yet">
        <Button onClick={() => setNewAssignmentDialogOpen(true)}>
          Create Assignment
        </Button>
      </EmptyState>
    )
  }

  // Determine what to show in the main content area based on selection
  const renderMainContent = () => {
    if (!assignmentSelection) {
      return <EmptyState message="Select an item from the sidebar" />
    }

    return (
      <GroupsPane
        assignment={selectedAssignment ?? null}
        groupSets={lmsGroupSets}
        students={students}
        onFileImportExport={() => setFileImportExportOpen(true)}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar - Aggregation views and assignments */}
      <AssignmentSidebar
        assignments={assignments}
        selection={assignmentSelection}
        onSelectAssignment={handleSelectAssignment}
        onNew={() => setNewAssignmentDialogOpen(true)}
        onEdit={handleEditAssignment}
        onDelete={handleDeleteAssignment}
      />

      {/* Main body - Content based on selection */}
      {renderMainContent()}
    </div>
  )
}
