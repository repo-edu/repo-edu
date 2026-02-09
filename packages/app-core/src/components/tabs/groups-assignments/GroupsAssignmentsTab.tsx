import { Button, EmptyState } from "@repo-edu/ui"
import { useCallback, useEffect, useRef } from "react"
import {
  selectSystemSetsReady,
  useProfileStore,
} from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"
import { GroupsAssignmentsPanel } from "./GroupsAssignmentsPanel"
import { GroupsAssignmentsSidebar } from "./GroupsAssignmentsSidebar"

/**
 * GroupsAssignmentsTab - Master-detail layout for group sets and assignments.
 *
 * Left: GroupsAssignmentsSidebar (selection navigation)
 * Right: GroupsAssignmentsPanel (detail view for selected item)
 */
export function GroupsAssignmentsTab() {
  const panelRef = useRef<HTMLDivElement>(null)

  const activeProfile = useUiStore((state) => state.activeProfile)
  const setNewProfileDialogOpen = useUiStore(
    (state) => state.setNewProfileDialogOpen,
  )
  const selection = useUiStore((state) => state.sidebarSelection)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setPreSelectedGroupSetId = useUiStore(
    (state) => state.setPreSelectedGroupSetId,
  )
  const setNewLocalGroupSetDialogOpen = useUiStore(
    (state) => state.setNewLocalGroupSetDialogOpen,
  )
  const setConnectLmsGroupSetDialogOpen = useUiStore(
    (state) => state.setConnectLmsGroupSetDialogOpen,
  )
  const setImportGroupSetDialogOpen = useUiStore(
    (state) => state.setImportGroupSetDialogOpen,
  )
  const systemSetsReady = useProfileStore(selectSystemSetsReady)
  const ensureSystemGroupSets = useProfileStore(
    (state) => state.ensureSystemGroupSets,
  )
  const roster = useProfileStore((state) => state.document?.roster ?? null)

  // Ensure system group sets on mount / roster change
  useEffect(() => {
    if (roster && !systemSetsReady) {
      ensureSystemGroupSets()
    }
  }, [roster, systemSetsReady, ensureSystemGroupSets])

  const handleAddAssignment = useCallback(
    (groupSetId: string) => {
      setPreSelectedGroupSetId(groupSetId)
      setNewAssignmentDialogOpen(true)
    },
    [setPreSelectedGroupSetId, setNewAssignmentDialogOpen],
  )

  const handleCreateLocalGroupSet = useCallback(() => {
    setNewLocalGroupSetDialogOpen(true)
  }, [setNewLocalGroupSetDialogOpen])

  const handleConnectGroupSet = useCallback(() => {
    setConnectLmsGroupSetDialogOpen(true)
  }, [setConnectLmsGroupSetDialogOpen])

  const handleImportGroupSet = useCallback(() => {
    setImportGroupSetDialogOpen(true)
  }, [setImportGroupSetDialogOpen])

  const handleRequestFocusPanel = useCallback(() => {
    if (!panelRef.current) return
    const firstFocusable = panelRef.current.querySelector<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )
    firstFocusable?.focus()
  }, [])

  if (!activeProfile) {
    return (
      <EmptyState message="No profile selected">
        <Button onClick={() => setNewProfileDialogOpen(true)}>
          Create Profile
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex h-full">
      <GroupsAssignmentsSidebar
        selection={selection}
        onSelect={setSidebarSelection}
        onAddAssignment={handleAddAssignment}
        onConnectGroupSet={handleConnectGroupSet}
        onCreateLocalGroupSet={handleCreateLocalGroupSet}
        onImportGroupSet={handleImportGroupSet}
        onRequestFocusPanel={handleRequestFocusPanel}
      />
      <div
        ref={panelRef}
        className="flex-1 flex flex-col min-h-0 focus:outline-none"
      >
        <GroupsAssignmentsPanel selection={selection} />
      </div>
    </div>
  )
}
