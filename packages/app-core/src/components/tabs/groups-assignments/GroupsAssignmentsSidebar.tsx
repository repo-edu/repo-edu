import type { Assignment, GroupSet } from "@repo-edu/backend-interface/types"
import { cn } from "@repo-edu/ui"
import { Plus, Upload } from "@repo-edu/ui/components/icons"
import type { KeyboardEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  selectConnectedGroupSets,
  selectGroupSets,
  selectLocalGroupSets,
  selectSystemGroupSet,
  useProfileStore,
} from "../../../stores/profileStore"
import { type SidebarSelection, useUiStore } from "../../../stores/uiStore"
import { GroupSetItem } from "./GroupSetItem"

interface GroupsAssignmentsSidebarProps {
  selection: SidebarSelection
  onSelect: (selection: SidebarSelection) => void
  onAddAssignment: (groupSetId: string) => void
  onConnectGroupSet: () => void
  onCreateLocalGroupSet: () => void
  onImportGroupSet: () => void
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
    <div className="px-2 pt-3 pb-1 flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      {action}
    </div>
  )
}

interface GroupSetRowData {
  groupSet: GroupSet
  assignments: Assignment[]
  groupCount: number
}

interface NavigationItem {
  itemId: string
  selection: Exclude<SidebarSelection, null>
}

function selectionToItemId(selection: SidebarSelection): string | null {
  if (!selection) return null
  return `${selection.kind}:${selection.id}`
}

function GroupSetList({
  rows,
  selection,
  expandedGroupSets,
  activeItemId,
  isOperationActive,
  busyGroupSetId,
  onSelect,
  onToggleExpanded,
  onAddAssignment,
  onGroupSetKeyDown,
  onAssignmentKeyDown,
}: {
  rows: GroupSetRowData[]
  selection: SidebarSelection
  expandedGroupSets: Record<string, boolean>
  activeItemId: string | null
  isOperationActive: boolean
  busyGroupSetId: string | null
  onSelect: (selection: SidebarSelection) => void
  onToggleExpanded: (groupSetId: string) => void
  onAddAssignment: (groupSetId: string) => void
  onGroupSetKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onAssignmentKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    assignmentId: string,
  ) => void
}) {
  return (
    <div className="space-y-0.5">
      {rows.map(({ groupSet, assignments, groupCount }) => (
        <GroupSetItem
          key={groupSet.id}
          groupSet={groupSet}
          assignments={assignments}
          groupCount={groupCount}
          selection={selection}
          expanded={!!expandedGroupSets[groupSet.id]}
          onSelect={onSelect}
          onToggleExpanded={onToggleExpanded}
          onAddAssignment={onAddAssignment}
          disableActions={isOperationActive}
          isBusy={busyGroupSetId === groupSet.id}
          tabIndex={activeItemId === `group-set:${groupSet.id}` ? 0 : -1}
          onGroupSetKeyDown={onGroupSetKeyDown}
          onAssignmentKeyDown={onAssignmentKeyDown}
          getAssignmentTabIndex={(assignmentId) =>
            activeItemId === `assignment:${assignmentId}` ? 0 : -1
          }
        />
      ))}
    </div>
  )
}

export function GroupsAssignmentsSidebar({
  selection,
  onSelect,
  onAddAssignment,
  onConnectGroupSet,
  onCreateLocalGroupSet,
  onImportGroupSet,
  onRequestFocusPanel,
}: GroupsAssignmentsSidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)

  const individualStudentsSet = useProfileStore(
    selectSystemGroupSet("individual_students"),
  )
  const staffSet = useProfileStore(selectSystemGroupSet("staff"))
  const connectedSets = useProfileStore(selectConnectedGroupSets)
  const localSets = useProfileStore(selectLocalGroupSets)
  const allGroupSets = useProfileStore(selectGroupSets)
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const groupSetOperation = useUiStore((state) => state.groupSetOperation)
  const isOperationActive = groupSetOperation !== null
  const busyGroupSetId = groupSetOperation?.groupSetId ?? null

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

  const hasAnyGroupSets = allGroupSets.length > 0

  const assignmentsByGroupSetId = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    if (!roster) return map

    for (const assignment of roster.assignments) {
      const existing = map.get(assignment.group_set_id)
      if (existing) {
        existing.push(assignment)
      } else {
        map.set(assignment.group_set_id, [assignment])
      }
    }

    return map
  }, [roster])

  const assignmentGroupSetById = useMemo(() => {
    const map = new Map<string, string>()
    for (const [groupSetId, assignments] of assignmentsByGroupSetId) {
      for (const assignment of assignments) {
        map.set(assignment.id, groupSetId)
      }
    }
    return map
  }, [assignmentsByGroupSetId])

  const groupCountByGroupSetId = useMemo(() => {
    const map = new Map<string, number>()
    const knownGroupIds = new Set(roster?.groups.map((group) => group.id) ?? [])

    for (const groupSet of allGroupSets) {
      const count = groupSet.group_ids.reduce(
        (total, groupId) => total + (knownGroupIds.has(groupId) ? 1 : 0),
        0,
      )
      map.set(groupSet.id, count)
    }

    return map
  }, [allGroupSets, roster])

  const [expandedGroupSets, setExpandedGroupSets] = useState<
    Record<string, boolean>
  >({})

  useEffect(() => {
    setExpandedGroupSets((previous) => {
      const next: Record<string, boolean> = {}
      let changed = false

      for (const groupSet of allGroupSets) {
        if (groupSet.id in previous) {
          next[groupSet.id] = previous[groupSet.id]
        } else {
          next[groupSet.id] =
            (assignmentsByGroupSetId.get(groupSet.id)?.length ?? 0) > 0
          changed = true
        }
      }

      if (Object.keys(previous).length !== Object.keys(next).length) {
        changed = true
      }

      return changed ? next : previous
    })
  }, [allGroupSets, assignmentsByGroupSetId])

  useEffect(() => {
    if (!selection || selection.kind !== "assignment") return
    const parentGroupSetId = assignmentGroupSetById.get(selection.id)
    if (!parentGroupSetId) return

    setExpandedGroupSets((previous) => {
      if (previous[parentGroupSetId]) return previous
      return { ...previous, [parentGroupSetId]: true }
    })
  }, [selection, assignmentGroupSetById])

  const buildRows = useCallback(
    (groupSets: GroupSet[]): GroupSetRowData[] => {
      return groupSets.map((groupSet) => ({
        groupSet,
        assignments: assignmentsByGroupSetId.get(groupSet.id) ?? [],
        groupCount: groupCountByGroupSetId.get(groupSet.id) ?? 0,
      }))
    },
    [assignmentsByGroupSetId, groupCountByGroupSetId],
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

        if (!expandedGroupSets[row.groupSet.id]) continue

        for (const assignment of row.assignments) {
          items.push({
            itemId: `assignment:${assignment.id}`,
            selection: { kind: "assignment", id: assignment.id },
          })
        }
      }
    }

    appendRows(systemRows)
    appendRows(connectedRows)
    appendRows(localRows)

    return items
  }, [systemRows, connectedRows, localRows, expandedGroupSets])

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

  const handleToggleExpanded = useCallback((groupSetId: string) => {
    setExpandedGroupSets((previous) => ({
      ...previous,
      [groupSetId]: !previous[groupSetId],
    }))
  }, [])

  const handleItemKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, itemId: string) => {
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

  const handleGroupSetKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const itemId = event.currentTarget.dataset.sidebarItemId
      if (!itemId) return
      handleItemKeyDown(event, itemId)
    },
    [handleItemKeyDown],
  )

  const handleAssignmentKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, assignmentId: string) => {
      handleItemKeyDown(event, `assignment:${assignmentId}`)
    },
    [handleItemKeyDown],
  )

  return (
    <div
      ref={sidebarRef}
      className="flex flex-col h-full border-r w-64 overflow-y-auto"
      data-sidebar-root
    >
      <div className="px-1">
        <SectionHeader>System</SectionHeader>
        {systemRows.length > 0 && (
          <GroupSetList
            rows={systemRows}
            selection={selection}
            expandedGroupSets={expandedGroupSets}
            activeItemId={activeItemId}
            isOperationActive={isOperationActive}
            busyGroupSetId={busyGroupSetId}
            onSelect={onSelect}
            onToggleExpanded={handleToggleExpanded}
            onAddAssignment={onAddAssignment}
            onGroupSetKeyDown={handleGroupSetKeyDown}
            onAssignmentKeyDown={handleAssignmentKeyDown}
          />
        )}
      </div>

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
              aria-label="Add connected group set"
              title="Add connected group set"
            >
              <Plus className="size-3.5" />
            </button>
          }
        >
          Connected Group Sets
        </SectionHeader>
        {connectedRows.length > 0 && (
          <GroupSetList
            rows={connectedRows}
            selection={selection}
            expandedGroupSets={expandedGroupSets}
            activeItemId={activeItemId}
            isOperationActive={isOperationActive}
            busyGroupSetId={busyGroupSetId}
            onSelect={onSelect}
            onToggleExpanded={handleToggleExpanded}
            onAddAssignment={onAddAssignment}
            onGroupSetKeyDown={handleGroupSetKeyDown}
            onAssignmentKeyDown={handleAssignmentKeyDown}
          />
        )}
      </div>

      <div className="px-1">
        <SectionHeader>Local Group Sets</SectionHeader>
        {sortedLocal.length > 0 && (
          <GroupSetList
            rows={localRows}
            selection={selection}
            expandedGroupSets={expandedGroupSets}
            activeItemId={activeItemId}
            isOperationActive={isOperationActive}
            busyGroupSetId={busyGroupSetId}
            onSelect={onSelect}
            onToggleExpanded={handleToggleExpanded}
            onAddAssignment={onAddAssignment}
            onGroupSetKeyDown={handleGroupSetKeyDown}
            onAssignmentKeyDown={handleAssignmentKeyDown}
          />
        )}
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1.5 mt-0.5 rounded-md text-left text-sm",
            "text-muted-foreground hover:bg-muted/50 transition-colors",
          )}
          onClick={onCreateLocalGroupSet}
          disabled={isOperationActive}
        >
          <Plus className="size-3.5" />
          <span>New Local Group Set</span>
        </button>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-sm",
            "text-muted-foreground hover:bg-muted/50 transition-colors",
          )}
          onClick={onImportGroupSet}
          disabled={isOperationActive}
        >
          <Upload className="size-3.5" />
          <span>Import from CSV</span>
        </button>
      </div>

      {!hasAnyGroupSets && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Create a local group set, import from CSV, or sync from LMS.
        </div>
      )}
    </div>
  )
}
