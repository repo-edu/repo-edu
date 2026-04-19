import type { GroupSetImportFormat } from "@repo-edu/domain/types"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
} from "@repo-edu/ui"
import { useCallback, useRef } from "react"
import {
  GROUPS_SIDEBAR_DEFAULT_WIDTH_PX,
  GROUPS_SIDEBAR_MAX_WIDTH_PX,
  GROUPS_SIDEBAR_MIN_WIDTH_PX,
} from "../../constants/layout.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { NoCourseEmptyState } from "../NoCourseEmptyState.js"
import { GroupsAssignmentsPanel } from "./groups-assignments/GroupsAssignmentsPanel.js"
import { GroupsAssignmentsSidebar } from "./groups-assignments/GroupsAssignmentsSidebar.js"

function clampSidebarWidthPx(size: number | null | undefined): number {
  const value = size ?? GROUPS_SIDEBAR_DEFAULT_WIDTH_PX
  return Math.min(
    GROUPS_SIDEBAR_MAX_WIDTH_PX,
    Math.max(GROUPS_SIDEBAR_MIN_WIDTH_PX, value),
  )
}

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

  const initialSidebarWidthPxRef = useRef(
    clampSidebarWidthPx(
      useAppSettingsStore.getState().settings.groupsSidebarSize,
    ),
  )
  const sidebarPanelRef = useRef<ResizablePanelHandle | null>(null)

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

  const handleLayoutChanged = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    const { setGroupsSidebarSize, save } = useAppSettingsStore.getState()
    setGroupsSidebarSize(clampSidebarWidthPx(panel.getSize().inPixels))
    void save()
  }, [])

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
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0"
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id="sidebar"
        panelRef={sidebarPanelRef}
        defaultSize={`${initialSidebarWidthPxRef.current}px`}
        minSize={`${GROUPS_SIDEBAR_MIN_WIDTH_PX}px`}
        maxSize={`${GROUPS_SIDEBAR_MAX_WIDTH_PX}px`}
        groupResizeBehavior="preserve-pixel-size"
        className="min-w-0"
      >
        <GroupsAssignmentsSidebar
          selection={selection}
          onSelect={setSidebarSelection}
          onConnectGroupSet={handleConnectGroupSet}
          onCreateLocalGroupSet={handleCreateLocalGroupSet}
          onImportGroupSet={handleImportGroupSet}
          onRequestFocusPanel={handleRequestFocusPanel}
        />
      </ResizablePanel>
      <ResizableHandle className="aria-[orientation=vertical]:w-px aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1 aria-[orientation=vertical]:after:w-2" />
      <ResizablePanel className="min-w-0">
        <div
          ref={panelRef}
          className="flex flex-col h-full min-h-0 focus:outline-none"
        >
          <GroupsAssignmentsPanel selection={selection} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
