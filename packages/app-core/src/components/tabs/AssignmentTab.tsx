/**
 * AssignmentTab - assignment management with master-detail layout.
 * Left sidebar shows assignments, main body shows groups for selected assignment.
 */

import type { AssignmentId } from "@repo-edu/backend-interface/types"
import { Button, EmptyState } from "@repo-edu/ui"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { AssignmentSidebar, GroupsPane } from "./assignment"

export function AssignmentTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const selectedAssignmentId = useProfileStore(
    (state) => state.selectedAssignmentId,
  )
  const selectAssignment = useProfileStore((state) => state.selectAssignment)
  const removeAssignment = useProfileStore((state) => state.removeAssignment)

  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setEditAssignmentDialogOpen = useUiStore(
    (state) => state.setEditAssignmentDialogOpen,
  )
  const setImportGroupsDialogOpen = useUiStore(
    (state) => state.setImportGroupsDialogOpen,
  )
  const setFileImportExportOpen = useUiStore(
    (state) => state.setFileImportExportOpen,
  )
  const addToast = useToastStore((state) => state.addToast)

  const assignments = roster?.assignments ?? []
  const students = roster?.students ?? []
  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId,
  )

  const handleEditAssignment = (id: AssignmentId) => {
    selectAssignment(id)
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

  return (
    <div className="flex h-full">
      {/* Left sidebar - Assignment list */}
      <AssignmentSidebar
        assignments={assignments}
        selectedId={selectedAssignmentId}
        onSelect={selectAssignment}
        onNew={() => setNewAssignmentDialogOpen(true)}
        onEdit={handleEditAssignment}
        onDelete={handleDeleteAssignment}
      />

      {/* Main body - Groups pane */}
      <GroupsPane
        assignment={selectedAssignment ?? null}
        students={students}
        onImportGroups={() => setImportGroupsDialogOpen(true)}
        onFileImportExport={() => setFileImportExportOpen(true)}
      />
    </div>
  )
}
