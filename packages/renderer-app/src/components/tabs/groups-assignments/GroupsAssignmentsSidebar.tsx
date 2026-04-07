import type { GroupSet, GroupSetImportFormat } from "@repo-edu/domain/types"
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { Download, Plus } from "@repo-edu/ui/components/icons"
import type { KeyboardEvent, ReactNode } from "react"
import { useCallback, useMemo, useRef } from "react"
import {
  selectConnectedGroupSets,
  selectGroupSets,
  selectLocalGroupSets,
  selectSystemGroupSet,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useToastStore } from "../../../stores/toast-store.js"
import { exportGroupSet } from "../../../utils/export-group-set.js"
import { getErrorMessage } from "../../../utils/error-message.js"
import {
  isLmsGroupSetConnection,
  isLmsRosterConnection,
} from "../../../utils/lms-provider.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { GroupSetItem } from "./GroupSetItem.js"

type SidebarSelection = { kind: "group-set"; id: string } | null

type GroupsAssignmentsSidebarProps = {
  selection: SidebarSelection
  onSelect: (selection: SidebarSelection) => void
  onConnectGroupSet: () => void
  onCreateLocalGroupSet: () => void
  onImportGroupSet: (format: GroupSetImportFormat) => void
  onRequestFocusPanel?: () => void
}

function SectionHeader({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="pl-2 pr-0 pt-3 pb-1 flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      {action}
    </div>
  )
}

type GroupSetRowData = {
  groupSet: GroupSet
  groupCount: number
  assignmentCount: number
}

type NavigationItem = {
  itemId: string
  selection: Exclude<SidebarSelection, null>
}

function selectionToItemId(selection: SidebarSelection): string | null {
  if (!selection) return null
  return `${selection.kind}:${selection.id}`
}

function buildGroupSetActions(
  groupSet: GroupSet,
  selectGroupSet: () => void,
  setters: {
    setRenameGroupSetTriggerId: (id: string | null) => void
    setSyncGroupSetTriggerId: (id: string | null) => void
    setReimportGroupSetTargetId: (id: string | null) => void
    onExportGroupSet: (groupSet: GroupSet) => void
    setCopyGroupSetSourceId: (id: string | null) => void
    setDeleteGroupSetTargetId: (id: string | null) => void
    setNewAssignmentDialogOpen: (open: boolean) => void
    setPreSelectedGroupSetId: (id: string | null) => void
  },
) {
  const groupSetId = groupSet.id
  const connection = groupSet.connection
  const kind = connection ? connection.kind : "local"
  const isNameEditable = kind === "local" || kind === "import"
  const isLms = isLmsGroupSetConnection(connection)
  const isImported = kind === "import"
  const isSystem = kind === "system"

  const withSelect = (fn: () => void) => () => {
    selectGroupSet()
    fn()
  }

  return {
    onAddAssignment: withSelect(() => {
      setters.setPreSelectedGroupSetId(groupSetId)
      setters.setNewAssignmentDialogOpen(true)
    }),
    onStartRename: isNameEditable
      ? () => setters.setRenameGroupSetTriggerId(groupSetId)
      : undefined,
    onSync: isLms
      ? withSelect(() => setters.setSyncGroupSetTriggerId(groupSetId))
      : undefined,
    onReimport: isImported
      ? withSelect(() => setters.setReimportGroupSetTargetId(groupSetId))
      : undefined,
    onExport: withSelect(() => setters.onExportGroupSet(groupSet)),
    onCopy:
      groupSet.nameMode === "named"
        ? withSelect(() => setters.setCopyGroupSetSourceId(groupSetId))
        : undefined,
    onDelete: !isSystem
      ? withSelect(() => setters.setDeleteGroupSetTargetId(groupSetId))
      : undefined,
  }
}

function GroupSetList({
  rows,
  selection,
  activeItemId,
  editingGroupSetId,
  busyGroupSetId,
  disabled,
  onSelect,
  onKeyDown,
  onRenameSubmit,
  onRenameCancel,
  actionSetters,
}: {
  rows: GroupSetRowData[]
  selection: SidebarSelection
  activeItemId: string | null
  editingGroupSetId: string | null
  busyGroupSetId: string | null
  disabled: boolean
  onSelect: (selection: SidebarSelection) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onRenameSubmit: (groupSetId: string, newName: string) => void
  onRenameCancel: () => void
  actionSetters: Parameters<typeof buildGroupSetActions>[2]
}) {
  return (
    <div className="space-y-0.5">
      {rows.map(({ groupSet, groupCount, assignmentCount }) => (
        <GroupSetItem
          key={groupSet.id}
          groupSet={groupSet}
          groupCount={groupCount}
          assignmentCount={assignmentCount}
          selection={selection}
          onSelect={onSelect}
          actions={buildGroupSetActions(
            groupSet,
            () => onSelect({ kind: "group-set", id: groupSet.id }),
            actionSetters,
          )}
          isEditing={editingGroupSetId === groupSet.id}
          onRenameSubmit={(newName) => onRenameSubmit(groupSet.id, newName)}
          onRenameCancel={onRenameCancel}
          disabled={disabled}
          isBusy={busyGroupSetId === groupSet.id}
          tabIndex={activeItemId === `group-set:${groupSet.id}` ? 0 : -1}
          onKeyDown={onKeyDown}
        />
      ))}
    </div>
  )
}

export function GroupsAssignmentsSidebar({
  selection,
  onSelect,
  onConnectGroupSet,
  onCreateLocalGroupSet,
  onImportGroupSet,
  onRequestFocusPanel,
}: GroupsAssignmentsSidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)

  const individualStudentsSet = useCourseStore(
    selectSystemGroupSet("individual_students"),
  )
  const staffSet = useCourseStore(selectSystemGroupSet("staff"))
  const connectedSets = useCourseStore(selectConnectedGroupSets)
  const localSets = useCourseStore(selectLocalGroupSets)
  const allGroupSets = useCourseStore(selectGroupSets)
  const roster = useCourseStore((s) => s.course?.roster ?? null)
  const hasLmsConnection = useCourseStore((s) =>
    isLmsRosterConnection(s.course?.roster?.connection),
  )
  const renameGroupSet = useCourseStore((s) => s.renameGroupSet)
  const groupSetOperation = useUiStore((s) => s.groupSetOperation)
  const isOperationActive = groupSetOperation !== null
  const busyGroupSetId =
    groupSetOperation && "groupSetId" in groupSetOperation
      ? groupSetOperation.groupSetId
      : null

  const setRenameGroupSetTriggerId = useUiStore(
    (s) => s.setRenameGroupSetTriggerId,
  )
  const setSyncGroupSetTriggerId = useUiStore((s) => s.setSyncGroupSetTriggerId)
  const setReimportGroupSetTargetId = useUiStore(
    (s) => s.setReimportGroupSetTargetId,
  )
  const setCopyGroupSetSourceId = useUiStore((s) => s.setCopyGroupSetSourceId)
  const setDeleteGroupSetTargetId = useUiStore(
    (s) => s.setDeleteGroupSetTargetId,
  )
  const setNewAssignmentDialogOpen = useUiStore(
    (s) => s.setNewAssignmentDialogOpen,
  )
  const setPreSelectedGroupSetId = useUiStore((s) => s.setPreSelectedGroupSetId)

  const course = useCourseStore((s) => s.course)
  const addToast = useToastStore((s) => s.addToast)

  const onExportGroupSet = useCallback(
    (groupSet: GroupSet) => {
      if (!course) return
      exportGroupSet(course, groupSet).catch((cause) => {
        addToast(`Export failed: ${getErrorMessage(cause)}`, { tone: "error" })
      })
    },
    [course, addToast],
  )

  const actionSetters = useMemo(
    () => ({
      setRenameGroupSetTriggerId,
      setSyncGroupSetTriggerId,
      setReimportGroupSetTargetId,
      onExportGroupSet,
      setCopyGroupSetSourceId,
      setDeleteGroupSetTargetId,
      setNewAssignmentDialogOpen,
      setPreSelectedGroupSetId,
    }),
    [
      setRenameGroupSetTriggerId,
      setSyncGroupSetTriggerId,
      setReimportGroupSetTargetId,
      onExportGroupSet,
      setCopyGroupSetSourceId,
      setDeleteGroupSetTargetId,
      setNewAssignmentDialogOpen,
      setPreSelectedGroupSetId,
    ],
  )

  const editingGroupSetId = useUiStore((s) => s.renameGroupSetTriggerId)

  const handleRenameSubmit = useCallback(
    (groupSetId: string, newName: string) => {
      renameGroupSet(groupSetId, newName)
      setRenameGroupSetTriggerId(null)
    },
    [renameGroupSet, setRenameGroupSetTriggerId],
  )

  const handleRenameCancel = useCallback(() => {
    setRenameGroupSetTriggerId(null)
  }, [setRenameGroupSetTriggerId])

  const sortedConnected = useMemo(
    () => [...connectedSets].sort((a, b) => a.name.localeCompare(b.name)),
    [connectedSets],
  )
  const sortedLocal = useMemo(
    () => [...localSets].sort((a, b) => a.name.localeCompare(b.name)),
    [localSets],
  )

  const systemSets = useMemo(() => {
    const sets: GroupSet[] = []
    if (individualStudentsSet) sets.push(individualStudentsSet)
    if (staffSet) sets.push(staffSet)
    return sets
  }, [individualStudentsSet, staffSet])

  const hasSystemGroups = useMemo(() => {
    const knownGroupIds = new Set(roster?.groups.map((g) => g.id) ?? [])
    return systemSets.some((set) =>
      set.nameMode === "named"
        ? set.groupIds.some((id) => knownGroupIds.has(id))
        : set.teams.length > 0,
    )
  }, [systemSets, roster])

  const hasAnyGroupSets = allGroupSets.length > 0

  const groupCountByGroupSetId = useMemo(() => {
    const map = new Map<string, number>()
    const knownGroupIds = new Set(roster?.groups.map((group) => group.id) ?? [])

    for (const groupSet of allGroupSets) {
      const count =
        groupSet.nameMode === "named"
          ? groupSet.groupIds.reduce(
              (total, groupId) => total + (knownGroupIds.has(groupId) ? 1 : 0),
              0,
            )
          : groupSet.teams.length
      map.set(groupSet.id, count)
    }

    return map
  }, [allGroupSets, roster])

  const assignmentCountByGroupSetId = useMemo(() => {
    const map = new Map<string, number>()

    for (const groupSet of allGroupSets) {
      map.set(groupSet.id, 0)
    }

    for (const assignment of roster?.assignments ?? []) {
      map.set(assignment.groupSetId, (map.get(assignment.groupSetId) ?? 0) + 1)
    }

    return map
  }, [allGroupSets, roster])

  const buildRows = useCallback(
    (groupSets: GroupSet[]): GroupSetRowData[] => {
      return groupSets.map((groupSet) => ({
        groupSet,
        groupCount: groupCountByGroupSetId.get(groupSet.id) ?? 0,
        assignmentCount: assignmentCountByGroupSetId.get(groupSet.id) ?? 0,
      }))
    },
    [assignmentCountByGroupSetId, groupCountByGroupSetId],
  )

  const systemRows = useMemo(
    () => buildRows(systemSets),
    [buildRows, systemSets],
  )
  const connectedRows = useMemo(
    () => buildRows(sortedConnected),
    [buildRows, sortedConnected],
  )
  const localRows = useMemo(
    () => buildRows(sortedLocal),
    [buildRows, sortedLocal],
  )

  const navigationItems = useMemo(() => {
    const items: NavigationItem[] = []
    const appendRows = (rows: GroupSetRowData[]) => {
      for (const row of rows) {
        items.push({
          itemId: `group-set:${row.groupSet.id}`,
          selection: { kind: "group-set", id: row.groupSet.id },
        })
      }
    }

    if (hasSystemGroups) appendRows(systemRows)
    if (hasLmsConnection || connectedRows.length > 0) appendRows(connectedRows)
    appendRows(localRows)
    return items
  }, [systemRows, connectedRows, localRows, hasSystemGroups, hasLmsConnection])

  const activeItemId = useMemo(() => {
    const selectedItemId = selectionToItemId(selection)
    if (
      selectedItemId &&
      navigationItems.some((item) => item.itemId === selectedItemId)
    ) {
      return selectedItemId
    }
    return navigationItems[0]?.itemId ?? null
  }, [selection, navigationItems])

  const focusSidebarItem = useCallback((itemId: string) => {
    const element = sidebarRef.current?.querySelector<HTMLButtonElement>(
      `[data-sidebar-item-id="${itemId}"]`,
    )
    element?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const itemId = event.currentTarget.dataset.sidebarItemId
      if (!itemId) return

      const index = navigationItems.findIndex((item) => item.itemId === itemId)
      if (index < 0) return

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        if (navigationItems.length === 0) return

        const direction = event.key === "ArrowDown" ? 1 : -1
        const nextIndex =
          (index + direction + navigationItems.length) % navigationItems.length
        const nextItem = navigationItems[nextIndex]

        onSelect(nextItem.selection)
        requestAnimationFrame(() => focusSidebarItem(nextItem.itemId))
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        onSelect(navigationItems[index].selection)
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        onSelect(null)
        return
      }

      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault()
        onRequestFocusPanel?.()
      }
    },
    [focusSidebarItem, navigationItems, onRequestFocusPanel, onSelect],
  )

  return (
    <div ref={sidebarRef} className="flex flex-col h-full overflow-y-auto">
      {hasSystemGroups && (
        <div className="px-1">
          <SectionHeader>System Group Sets</SectionHeader>
          <GroupSetList
            rows={systemRows}
            selection={selection}
            activeItemId={activeItemId}
            editingGroupSetId={editingGroupSetId}
            busyGroupSetId={busyGroupSetId}
            disabled={isOperationActive}
            onSelect={onSelect}
            onKeyDown={handleKeyDown}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
            actionSetters={actionSetters}
          />
        </div>
      )}

      {(hasLmsConnection || connectedRows.length > 0) && (
        <div className="px-1">
          <SectionHeader
            action={
              <button
                type="button"
                className={cn(
                  "h-6 w-6 rounded-md inline-flex items-center justify-center shrink-0",
                  "text-muted-foreground hover:bg-muted/50 transition-colors",
                )}
                onClick={onConnectGroupSet}
                disabled={isOperationActive}
                aria-label="Add LMS group set"
                title="Add LMS group set"
              >
                <Plus className="size-3.5" />
              </button>
            }
          >
            LMS Group Sets
          </SectionHeader>
          {connectedRows.length > 0 && (
            <GroupSetList
              rows={connectedRows}
              selection={selection}
              activeItemId={activeItemId}
              editingGroupSetId={editingGroupSetId}
              busyGroupSetId={busyGroupSetId}
              disabled={isOperationActive}
              onSelect={onSelect}
              onKeyDown={handleKeyDown}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={handleRenameCancel}
              actionSetters={actionSetters}
            />
          )}
        </div>
      )}

      <div className="px-1">
        <SectionHeader
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-6 w-6 rounded-md inline-flex items-center justify-center shrink-0",
                    "text-muted-foreground hover:bg-muted/50 transition-colors",
                  )}
                  disabled={isOperationActive}
                  aria-label="Add local group set"
                  title="Add local group set"
                >
                  <Plus className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  disabled={isOperationActive}
                  onClick={onCreateLocalGroupSet}
                >
                  <Plus className="size-3.5 mr-2" />
                  New group set
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isOperationActive}
                  onClick={() => onImportGroupSet("group-set-csv")}
                >
                  <Download className="size-3.5 mr-2" />
                  Import named groups (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isOperationActive}
                  onClick={() => onImportGroupSet("repobee-students")}
                >
                  <Download className="size-3.5 mr-2" />
                  Import unnamed teams (TXT)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          Local Group Sets
        </SectionHeader>
        {localRows.length > 0 && (
          <GroupSetList
            rows={localRows}
            selection={selection}
            activeItemId={activeItemId}
            editingGroupSetId={editingGroupSetId}
            busyGroupSetId={busyGroupSetId}
            disabled={isOperationActive}
            onSelect={onSelect}
            onKeyDown={handleKeyDown}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
            actionSetters={actionSetters}
          />
        )}
      </div>

      {!hasAnyGroupSets && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Create a local group set, import from file, or sync from LMS.
        </div>
      )}
    </div>
  )
}
