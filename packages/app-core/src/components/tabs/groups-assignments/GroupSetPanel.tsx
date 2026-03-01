import type {
  Assignment,
  AssignmentMetadata,
  Group,
  GroupSet,
  GroupSetConnection,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ChevronDown,
  Download,
  File,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "@repo-edu/ui/components/icons"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../../bindings/commands"
import { saveDialog } from "../../../services/platform"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import {
  selectAssignmentsForGroupSet,
  selectCourse,
  selectEditableGroupsByGroupSet,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useProfileStore,
} from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { type GroupSetPanelTab, useUiStore } from "../../../stores/uiStore"
import { applyGroupSetPatch } from "../../../utils/groupSetPatch"
import { buildLmsOperationContext } from "../../../utils/operationContext"
import {
  chainComparisons,
  compareNumber,
  compareText,
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../utils/sorting"
import { SortHeaderButton } from "../../common/SortHeaderButton"
import { GroupItem } from "./GroupItem"

interface GroupSetPanelProps {
  groupSetId: string
}

/** Determine the connection "kind" for display purposes. */
function getConnectionKind(
  connection: GroupSetConnection | null,
): "local" | "system" | "canvas" | "moodle" | "import" {
  if (!connection) return "local"
  return connection.kind
}

export function GroupSetPanel({ groupSetId }: GroupSetPanelProps) {
  const groupSet = useProfileStore(selectGroupSetById(groupSetId))
  const groups = useProfileStore(selectGroupsForGroupSet(groupSetId))
  const assignments = useProfileStore(selectAssignmentsForGroupSet(groupSetId))
  const updateAssignment = useProfileStore((state) => state.updateAssignment)
  const deleteAssignment = useProfileStore((state) => state.deleteAssignment)
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const course = useProfileStore(selectCourse)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const addToast = useToastStore((state) => state.addToast)

  // Dialog triggers from uiStore
  const groupSetOperation = useUiStore((state) => state.groupSetOperation)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
  const panelTab = useUiStore((state) => state.groupSetPanelTab)
  const setPanelTab = useUiStore((state) => state.setGroupSetPanelTab)
  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setPreSelectedGroupSetId = useUiStore(
    (state) => state.setPreSelectedGroupSetId,
  )
  const setAddGroupDialogGroupSetId = useUiStore(
    (state) => state.setAddGroupDialogGroupSetId,
  )
  const setDeleteGroupTargetId = useUiStore(
    (state) => state.setDeleteGroupTargetId,
  )
  const setReimportGroupSetTargetId = useUiStore(
    (state) => state.setReimportGroupSetTargetId,
  )
  const [syncProgressMessage, setSyncProgressMessage] = useState<string | null>(
    null,
  )

  if (!groupSet) {
    return (
      <EmptyState message="Group set not found">
        <Text className="text-muted-foreground text-center">
          The selected group set no longer exists.
        </Text>
      </EmptyState>
    )
  }

  const connection = groupSet.connection
  const kind = getConnectionKind(connection)
  const lmsContext = buildLmsOperationContext(lmsConnection, course.id)
  const isOperationActive = groupSetOperation !== null
  const isThisGroupSetBusy = groupSetOperation?.groupSetId === groupSetId
  const operationLabel =
    groupSetOperation?.kind === "sync" && isThisGroupSetBusy
      ? (syncProgressMessage ?? "Syncing group set...")
      : groupSetOperation?.kind === "reimport" && isThisGroupSetBusy
        ? "Importing group set..."
        : groupSetOperation?.kind === "import"
          ? "Importing group set..."
          : null

  useEffect(() => {
    if (!(groupSetOperation?.kind === "sync" && isThisGroupSetBusy)) {
      setSyncProgressMessage(null)
    }
  }, [groupSetOperation?.kind, isThisGroupSetBusy])

  const isLms = kind === "canvas" || kind === "moodle"
  const isImport = kind === "import"
  const isReadOnly = kind === "system" || isLms
  const handleSync = useCallback(async () => {
    if (!roster || (kind !== "canvas" && kind !== "moodle")) return
    if (!lmsContext) {
      addToast("Sync failed: LMS connection or course is not configured", {
        tone: "error",
      })
      return
    }

    setGroupSetOperation({ kind: "sync", groupSetId })
    setSyncProgressMessage("Connecting to LMS...")

    try {
      const result = await commands.syncGroupSet(
        lmsContext,
        roster,
        groupSetId,
        setSyncProgressMessage,
      )
      if (result.status === "ok") {
        const updatedRoster = applyGroupSetPatch(roster, result.data)
        setRoster(updatedRoster, `Sync group set "${groupSet.name}"`)
        addToast(`Synced "${groupSet.name}"`, { tone: "success" })
      } else {
        addToast(`Sync failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Sync failed: ${message}`, { tone: "error" })
    } finally {
      const currentOp = useUiStore.getState().groupSetOperation
      if (currentOp?.kind === "sync" && currentOp.groupSetId === groupSetId) {
        setGroupSetOperation(null)
      }
    }
  }, [
    addToast,
    groupSet.name,
    groupSetId,
    kind,
    lmsContext,
    roster,
    setGroupSetOperation,
    setRoster,
  ])

  const handleExport = useCallback(async () => {
    if (!roster) return

    const defaultPath =
      (connection?.kind === "import" && connection.source_path) ||
      `${groupSet.name}.csv`

    const path = await saveDialog({
      defaultPath,
      filters: [{ name: "CSV files", extensions: ["csv"] }],
    })
    if (!path) return

    try {
      const result = await commands.exportGroupSet(roster, groupSetId, path)
      if (result.status === "ok") {
        const exportedPath = result.data
        // Update connection source_path so the next export/import opens here
        if (connection?.kind === "import") {
          const updatedRoster = {
            ...roster,
            group_sets: roster.group_sets.map((gs) =>
              gs.id === groupSetId
                ? {
                    ...gs,
                    connection: { ...connection, source_path: exportedPath },
                  }
                : gs,
            ),
          }
          setRoster(updatedRoster, `Export group set "${groupSet.name}"`)
        }
        addToast(`Exported "${groupSet.name}" to ${path}`, { tone: "success" })
      } else {
        addToast(`Export failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Export failed: ${message}`, { tone: "error" })
    }
  }, [addToast, connection, groupSet.name, groupSetId, roster, setRoster])

  // Consume sidebar export trigger
  const exportGroupSetTriggerId = useUiStore(
    (state) => state.exportGroupSetTriggerId,
  )
  const setExportGroupSetTriggerId = useUiStore(
    (state) => state.setExportGroupSetTriggerId,
  )
  useEffect(() => {
    if (exportGroupSetTriggerId === groupSetId) {
      setExportGroupSetTriggerId(null)
      handleExport()
    }
  }, [
    exportGroupSetTriggerId,
    groupSetId,
    setExportGroupSetTriggerId,
    handleExport,
  ])

  // Consume sidebar sync trigger
  const syncGroupSetTriggerId = useUiStore(
    (state) => state.syncGroupSetTriggerId,
  )
  const setSyncGroupSetTriggerId = useUiStore(
    (state) => state.setSyncGroupSetTriggerId,
  )
  useEffect(() => {
    if (syncGroupSetTriggerId === groupSetId) {
      setSyncGroupSetTriggerId(null)
      handleSync()
    }
  }, [syncGroupSetTriggerId, groupSetId, setSyncGroupSetTriggerId, handleSync])

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 min-h-11 pb-3 border-b">
        <span className="text-sm font-medium truncate">{groupSet.name}</span>
        {isReadOnly && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="size-3 shrink-0 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isLms
                  ? "Synced from LMS — read-only"
                  : "System group set — auto-managed"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="ml-auto min-w-0 flex flex-wrap justify-end gap-2">
          {isLms && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={isOperationActive || !lmsContext}
              title="Sync groups from LMS"
            >
              {isThisGroupSetBusy && groupSetOperation?.kind === "sync" ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-1" />
                  Sync
                </>
              )}
            </Button>
          )}
          {isImport && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReimportGroupSetTargetId(groupSetId)}
              disabled={isOperationActive}
              title="Reimport groups from CSV file"
            >
              {isThisGroupSetBusy && groupSetOperation?.kind === "reimport" ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="size-4 mr-1" />
                  Reimport
                </>
              )}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={groups.length === 0}
                title="Export group set to CSV"
              >
                Export
                <ChevronDown className="size-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                Group Set (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Operation banner */}
      {operationLabel && (
        <div className="px-3 py-2 flex items-center gap-1.5 text-xs text-muted-foreground border-b">
          <Loader2 className="size-3 animate-spin" />
          <span>{operationLabel}</span>
        </div>
      )}

      {/* Sub-tabs */}
      <Tabs
        value={panelTab}
        onValueChange={(v) => setPanelTab(v as GroupSetPanelTab)}
        className="flex-1 min-h-0 gap-0"
      >
        <TabsList className="w-full border-b px-3 shrink-0">
          <TabsTrigger
            value="groups"
            className="border-b-2 border-transparent data-[state=active]:border-foreground rounded-none"
          >
            Groups ({groups.length})
          </TabsTrigger>
          <TabsTrigger
            value="assignments"
            className="border-b-2 border-transparent data-[state=active]:border-foreground rounded-none"
          >
            Assignments ({assignments.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="groups"
          className="flex flex-col min-h-0 overflow-hidden"
        >
          <GroupsList
            groupSet={groupSet}
            groups={groups}
            kind={kind}
            roster={roster}
            disabled={isOperationActive}
            onDeleteGroup={(gid) => setDeleteGroupTargetId(gid)}
            onCreateGroup={() => setAddGroupDialogGroupSetId(groupSetId)}
          />
        </TabsContent>
        <TabsContent
          value="assignments"
          className="flex flex-col min-h-0 overflow-hidden"
        >
          <AssignmentsPanel
            assignments={assignments}
            disabled={isOperationActive}
            onAdd={() => {
              setPreSelectedGroupSetId(groupSetId)
              setNewAssignmentDialogOpen(true)
            }}
            onUpdate={updateAssignment}
            onDelete={deleteAssignment}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Assignments Panel (tab content) ---

function AssignmentsPanel({
  assignments,
  disabled,
  onAdd,
  onUpdate,
  onDelete,
}: {
  assignments: Assignment[]
  disabled: boolean
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<AssignmentMetadata>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={onAdd} disabled={disabled}>
          <Plus className="size-4 mr-1" />
          Add Assignment
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        {assignments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No assignments yet</p>
        ) : (
          <div>
            {assignments.map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                disabled={disabled}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t text-sm text-muted-foreground">
        {assignments.length} assignment{assignments.length !== 1 ? "s" : ""}
      </div>
    </div>
  )
}

function AssignmentRow({
  assignment,
  disabled,
  onUpdate,
  onDelete,
}: {
  assignment: Assignment
  disabled: boolean
  onUpdate: (id: string, updates: Partial<AssignmentMetadata>) => void
  onDelete: (id: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(assignment.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) setEditName(assignment.name)
  }, [assignment.name, isEditing])

  const handleSave = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== assignment.name) {
      onUpdate(assignment.id, { name: trimmed })
    }
    setIsEditing(false)
  }, [editName, assignment.name, assignment.id, onUpdate])

  return (
    <div className="flex items-center gap-1.5 group rounded-md px-1.5 py-0.5 hover:bg-muted/50">
      <File className="size-3 shrink-0 text-muted-foreground" />
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editName}
          disabled={disabled}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") {
              setIsEditing(false)
              setEditName(assignment.name)
            }
          }}
          className="h-6 text-xs font-medium px-1 flex-1 min-w-0"
        />
      ) : (
        <button
          type="button"
          className="text-xs font-medium truncate hover:underline cursor-pointer text-left flex-1 min-w-0"
          onClick={() => {
            if (!disabled) {
              setEditName(assignment.name)
              setIsEditing(true)
            }
          }}
          disabled={disabled}
        >
          {assignment.name}
        </button>
      )}
      {confirmDelete ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="destructive"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => {
              onDelete(assignment.id)
              setConfirmDelete(false)
            }}
            disabled={disabled}
          >
            Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => setConfirmDelete(false)}
            disabled={disabled}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={disabled}
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </div>
  )
}

// --- Groups List ---

interface GroupRow {
  group: Group
  memberCount: number
  members: RosterMember[]
}

function compareGroupRowsByName(left: GroupRow, right: GroupRow): number {
  return chainComparisons(
    compareText(left.group.name, right.group.name),
    compareText(left.group.id, right.group.id),
  )
}

function compareGroupRowNames(
  rowA: { original: GroupRow },
  rowB: {
    original: GroupRow
  },
): number {
  return compareGroupRowsByName(rowA.original, rowB.original)
}

function compareGroupRowMemberCounts(
  rowA: { original: GroupRow },
  rowB: { original: GroupRow },
): number {
  return chainComparisons(
    compareNumber(rowA.original.memberCount, rowB.original.memberCount),
    compareGroupRowsByName(rowA.original, rowB.original),
  )
}

function GroupsList({
  groupSet,
  groups,
  kind,
  roster,
  disabled,
  onDeleteGroup,
  onCreateGroup,
}: {
  groupSet: GroupSet
  groups: Group[]
  kind: ReturnType<typeof getConnectionKind>
  roster: Roster | null
  disabled: boolean
  onDeleteGroup: (groupId: string) => void
  onCreateGroup: () => void
}) {
  const isSetEditable = kind === "local" || kind === "import"
  const editableTargets = useProfileStore(selectEditableGroupsByGroupSet)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  const handleSort = useCallback((columnId: string) => {
    setSorting((current) => getNextProgressiveSorting(current, columnId))
  }, [])

  const handleSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting((current) =>
      normalizeProgressiveSorting(
        typeof updater === "function" ? updater(current) : updater,
      ),
    )
  }, [])

  // Build member lookup map
  const memberMap = useMemo(() => {
    if (!roster) return new Map<string, RosterMember>()
    const map = new Map<string, RosterMember>()
    for (const m of roster.students) map.set(m.id, m)
    for (const m of roster.staff) map.set(m.id, m)
    return map
  }, [roster])

  // Staff ID set
  const staffIds = useMemo(() => {
    if (!roster) return new Set<string>()
    return new Set(roster.staff.map((m) => m.id))
  }, [roster])

  // Resolve active members for a group (non-active members are preserved in
  // member_ids but filtered out at display time)
  const resolveMembers = useCallback(
    (group: Group): RosterMember[] => {
      return group.member_ids
        .map((id) => memberMap.get(id))
        .filter((m): m is RosterMember => !!m && m.status === "active")
    },
    [memberMap],
  )

  // Build member → group IDs index for dedup filtering (active members only)
  const memberGroupIndex = useMemo(() => {
    if (!roster) return new Map<string, Set<string>>()
    const allMembers = [...roster.students, ...roster.staff]
    const activeIds = new Set(
      allMembers.filter((m) => m.status === "active").map((m) => m.id),
    )
    const index = new Map<string, Set<string>>()
    for (const group of roster.groups) {
      for (const memberId of group.member_ids) {
        if (!activeIds.has(memberId)) continue
        let groupIds = index.get(memberId)
        if (!groupIds) {
          groupIds = new Set<string>()
          index.set(memberId, groupIds)
        }
        groupIds.add(group.id)
      }
    }
    return index
  }, [roster])

  // Build table data
  const data = useMemo<GroupRow[]>(
    () =>
      groups.map((group) => {
        const members = resolveMembers(group)
        return { group, memberCount: members.length, members }
      }),
    [groups, resolveMembers],
  )

  // Column definitions (sorting metadata only — cells are not rendered via the table)
  const columns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.group.name,
        header: ({ column }) => (
          <SortHeaderButton
            label="Group"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareGroupRowNames,
      },
      {
        id: "members",
        accessorFn: (row) => row.memberCount,
        header: ({ column }) => (
          <SortHeaderButton
            label="Members"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareGroupRowMemberCounts,
      },
    ],
    [handleSort],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue) return true
      const normalizedFilter = filterValue.toLowerCase()

      if (row.original.group.name.toLowerCase().includes(normalizedFilter)) {
        return true
      }

      return row.original.members.some((member) =>
        member.name.toLowerCase().includes(normalizedFilter),
      )
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Unique active member count across all groups in this set
  const totalMembers = useMemo(() => {
    const uniqueIds = new Set<string>()
    for (const row of data) {
      for (const member of row.members) {
        uniqueIds.add(member.id)
      }
    }
    return uniqueIds.size
  }, [data])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search + Add Group */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 size-4" />
          <Input
            placeholder="Search groups and members..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        {isSetEditable && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCreateGroup}
            disabled={disabled}
          >
            <Plus className="size-4 mr-1" />
            Add Group
          </Button>
        )}
      </div>

      {/* Groups content */}
      <div className="flex-1 overflow-y-auto px-4">
        {groups.length === 0 ? (
          <GroupsEmptyState kind={kind} />
        ) : (
          <>
            {/* Sortable column headers */}
            <div className="sticky top-0 z-10 bg-muted border-b mb-1">
              {table.getHeaderGroups().map((headerGroup) => (
                <div key={headerGroup.id} className="flex items-center">
                  {headerGroup.headers.map((header) => (
                    <div
                      key={header.id}
                      className={
                        header.id === "name"
                          ? "p-2 text-left font-medium relative min-w-0 flex-1"
                          : "py-2 pl-2 pr-4 text-right font-medium relative min-w-0 shrink-0 w-24 ml-auto"
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Sorted + filtered groups */}
            <div className="divide-y">
              {table.getRowModel().rows.map((row) => (
                <GroupItem
                  key={row.original.group.id}
                  group={row.original.group}
                  groupSetId={groupSet.id}
                  members={row.original.members}
                  staffIds={staffIds}
                  isSetEditable={isSetEditable}
                  disabled={disabled}
                  editableTargets={editableTargets}
                  memberGroupIndex={memberGroupIndex}
                  onDeleteGroup={() => onDeleteGroup(row.original.group.id)}
                />
              ))}
            </div>

            {table.getRowModel().rows.length === 0 && globalFilter && (
              <p className="p-4 text-center text-muted-foreground text-sm">
                No groups match search
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-2 border-t text-sm text-muted-foreground">
        {groups.length} group{groups.length !== 1 ? "s" : ""} · {totalMembers}{" "}
        member{totalMembers !== 1 ? "s" : ""}
      </div>
    </div>
  )
}

function GroupsEmptyState({
  kind,
}: {
  kind: ReturnType<typeof getConnectionKind>
}) {
  const isSystem = kind === "system"
  const isLms = kind === "canvas" || kind === "moodle"
  const message = isSystem
    ? "Add students to the roster to see individual groups"
    : isLms
      ? "Sync from LMS to load groups"
      : "Add groups to this set"

  return <p className="text-xs text-muted-foreground">{message}</p>
}
