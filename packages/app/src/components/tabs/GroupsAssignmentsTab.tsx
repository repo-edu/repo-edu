import { useCallback, useRef } from "react"
import { useProfileStore } from "../../stores/profile-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { NoProfileEmptyState } from "../NoProfileEmptyState.js"
import { GroupsAssignmentsPanel } from "./groups-assignments/GroupsAssignmentsPanel.js"
import { GroupsAssignmentsSidebar } from "./groups-assignments/GroupsAssignmentsSidebar.js"

export function GroupsAssignmentsTab() {
  const panelRef = useRef<HTMLDivElement>(null)

  const activeProfileId = useUiStore((s) => s.activeProfileId)
  const profile = useProfileStore((s) => s.profile)
  const selection = useUiStore((s) => s.sidebarSelection)
  const setSidebarSelection = useUiStore((s) => s.setSidebarSelection)
  const setNewLocalGroupSetDialogOpen = useUiStore(
    (s) => s.setNewLocalGroupSetDialogOpen,
  )
  const setConnectLmsGroupSetDialogOpen = useUiStore(
    (s) => s.setConnectLmsGroupSetDialogOpen,
  )
  const setImportGroupSetDialogOpen = useUiStore(
    (s) => s.setImportGroupSetDialogOpen,
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

  if (!activeProfileId || !profile) {
    return <NoProfileEmptyState tabLabel="groups and assignments" />
  }

  return (
    <div className="flex h-full">
      <GroupsAssignmentsSidebar
        selection={selection}
        onSelect={setSidebarSelection}
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
