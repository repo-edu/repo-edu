import type { GroupSetImportFormat } from "@repo-edu/domain/types"
import { useCallback, useRef } from "react"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { NoCourseEmptyState } from "../NoCourseEmptyState.js"
import { GroupsAssignmentsPanel } from "./groups-assignments/GroupsAssignmentsPanel.js"
import { GroupsAssignmentsSidebar } from "./groups-assignments/GroupsAssignmentsSidebar.js"

export function GroupsAssignmentsTab() {
  const panelRef = useRef<HTMLDivElement>(null)

  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const course = useCourseStore((s) => s.course)
  const selection = useUiStore((s) => s.sidebarSelection)
  const setSidebarSelection = useUiStore((s) => s.setSidebarSelection)
  const setNewLocalGroupSetDialogOpen = useUiStore(
    (s) => s.setNewLocalGroupSetDialogOpen,
  )
  const setConnectLmsGroupSetDialogOpen = useUiStore(
    (s) => s.setConnectLmsGroupSetDialogOpen,
  )
  const setImportGroupSetFormat = useUiStore((s) => s.setImportGroupSetFormat)

  const handleCreateLocalGroupSet = useCallback(() => {
    setNewLocalGroupSetDialogOpen(true)
  }, [setNewLocalGroupSetDialogOpen])

  const handleConnectGroupSet = useCallback(() => {
    setConnectLmsGroupSetDialogOpen(true)
  }, [setConnectLmsGroupSetDialogOpen])

  const handleImportGroupSet = useCallback(
    (format: GroupSetImportFormat) => {
      setImportGroupSetFormat(format)
    },
    [setImportGroupSetFormat],
  )

  const handleRequestFocusPanel = useCallback(() => {
    if (!panelRef.current) return
    const firstFocusable = panelRef.current.querySelector<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )
    firstFocusable?.focus()
  }, [])

  if (!activeCourseId || !course) {
    return <NoCourseEmptyState tabLabel="groups and assignments" />
  }

  return (
    <div className="flex h-full min-h-0">
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
