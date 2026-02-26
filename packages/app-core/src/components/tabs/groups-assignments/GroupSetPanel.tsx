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
  File,
  Info,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from "@repo-edu/ui/components/icons"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../../bindings/commands"
import { saveDialog } from "../../../services/platform"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useOutputStore } from "../../../stores/outputStore"
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
  formatExactTimestamp,
  formatRelativeTime,
} from "../../../utils/relativeTime"
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

/** Helper to get sync/import timestamp from connection. */
function connectionTimestamp(
  connection: GroupSetConnection | null,
): { relative: string; exact: string | null } | null {
  if (!connection) return null
  if (connection.kind === "canvas" || connection.kind === "moodle") {
    return {
      relative: `Last synced ${formatRelativeTime(connection.last_updated)}`,
      exact: formatExactTimestamp(connection.last_updated),
    }
  }
  if (connection.kind === "import") {
    return {
      relative: `Imported ${formatRelativeTime(connection.last_updated)}`,
      exact: formatExactTimestamp(connection.last_updated),
    }
  }
  return null
}

function systemTypeNote(connection: GroupSetConnection | null): string | null {
  if (!connection || connection.kind !== "system") return null
  if (connection.system_type === "individual_students") {
    return "Auto-maintained: one group per active student. Syncs with roster changes."
  }
  return "Auto-maintained: contains all non-student roles."
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
  const appendOutput = useOutputStore((state) => state.appendText)
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
      ? "Syncing group set..."
      : groupSetOperation?.kind === "reimport" && isThisGroupSetBusy
        ? "Importing group set..."
        : groupSetOperation?.kind === "import"
          ? "Importing group set..."
          : null

  const handleSync = useCallback(async () => {
    if (!roster || (kind !== "canvas" && kind !== "moodle")) return
    if (!lmsContext) {
      addToast("Sync failed: LMS connection or course is not configured", {
        tone: "error",
      })
      appendOutput(
        `Sync failed for "${groupSet.name}": LMS connection or course is not configured`,
        "error",
      )
      return
    }

    setGroupSetOperation({ kind: "sync", groupSetId })
    appendOutput(`Syncing group set "${groupSet.name}"...`, "info")

    try {
      const result = await commands.syncGroupSet(lmsContext, roster, groupSetId)
      if (result.status === "ok") {
        const updatedRoster = applyGroupSetPatch(roster, result.data)
        setRoster(updatedRoster, `Sync group set "${groupSet.name}"`)
        appendOutput(`Synced group set "${groupSet.name}"`, "success")
      } else {
        addToast(`Sync failed: ${result.error.message}`, { tone: "error" })
        appendOutput(
          `Sync failed for "${groupSet.name}": ${result.error.message}`,
          "error",
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Sync failed: ${message}`, { tone: "error" })
      appendOutput(`Sync failed for "${groupSet.name}": ${message}`, "error")
    } finally {
      const currentOp = useUiStore.getState().groupSetOperation
      if (currentOp?.kind === "sync" && currentOp.groupSetId === groupSetId) {
        setGroupSetOperation(null)
      }
    }
  }, [
    addToast,
    appendOutput,
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
        appendOutput(
          `Exported group set "${groupSet.name}" to ${path}`,
          "success",
        )
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }, [appendOutput, connection, groupSet.name, groupSetId, roster, setRoster])

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
      {operationLabel && (
        <div className="px-4 py-2 flex items-center gap-1.5 text-xs text-muted-foreground border-b">
          <Loader2 className="size-3 animate-spin" />
          <span>{operationLabel}</span>
        </div>
      )}
      <Tabs
        value={panelTab}
        onValueChange={(v) => setPanelTab(v as GroupSetPanelTab)}
        className="flex-1 min-h-0 gap-0"
      >
        <TabsList size="compact" className="w-full border-b px-3 shrink-0">
          <TabsTrigger
            value="groups"
            size="compact"
            className="border-b-2 border-transparent data-[state=active]:border-foreground rounded-none"
          >
            Groups ({groups.length})
          </TabsTrigger>
          <TabsTrigger
            value="assignments"
            size="compact"
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
            connection={connection}
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

// --- Connection metadata (shown inside Groups tab) ---

function GroupSetConnectionInfo({
  timestamp,
  importFilename,
  isLms,
  note,
}: {
  timestamp: { relative: string; exact: string | null } | null
  importFilename: string | null
  isLms: boolean
  note: string | null
}) {
  const hasContent = timestamp || importFilename || isLms || note

  if (!hasContent) return null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-0.5 mb-2 text-xs text-muted-foreground">
        {timestamp && (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="cursor-default w-fit">{timestamp.relative}</p>
            </TooltipTrigger>
            {timestamp.exact && (
              <TooltipContent side="bottom" className="text-xs">
                {timestamp.exact}
              </TooltipContent>
            )}
          </Tooltip>
        )}
        {importFilename && <p>Source: {importFilename}</p>}

        {isLms && (
          <div className="flex items-center gap-1.5">
            <Lock className="size-3 shrink-0" />
            <span>
              Sync from LMS to update groups. Copy to create a local set.
            </span>
          </div>
        )}

        {note && (
          <div className="flex items-center gap-1.5">
            <Info className="size-3 shrink-0" />
            <span>{note}</span>
          </div>
        )}
      </div>
    </TooltipProvider>
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
    <div className="flex-1 overflow-y-auto h-full px-4 py-2">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={onAdd}
          disabled={disabled}
        >
          <Plus className="size-3 mr-1" />
          Add Assignment
        </Button>
      </div>
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

function GroupsList({
  groupSet,
  groups,
  connection,
  kind,
  roster,
  disabled,
  onDeleteGroup,
  onCreateGroup,
}: {
  groupSet: GroupSet
  groups: Group[]
  connection: GroupSetConnection | null
  kind: ReturnType<typeof getConnectionKind>
  roster: Roster | null
  disabled: boolean
  onDeleteGroup: (groupId: string) => void
  onCreateGroup: () => void
}) {
  const isSetEditable = kind === "local" || kind === "import"
  const editableTargets = useProfileStore(selectEditableGroupsByGroupSet)
  const [sorting, setSorting] = useState<SortingState>([])

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

  // Resolve members for a group
  const resolveMembers = useCallback(
    (group: Group): RosterMember[] => {
      return group.member_ids
        .map((id) => memberMap.get(id))
        .filter((m): m is RosterMember => !!m)
    },
    [memberMap],
  )

  // Build member → group IDs index for dedup filtering
  const memberGroupIndex = useMemo(() => {
    if (!roster) return new Map<string, Set<string>>()
    const index = new Map<string, Set<string>>()
    for (const group of roster.groups) {
      for (const memberId of group.member_ids) {
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
          <SortHeaderButton label="Group" column={column} />
        ),
      },
      {
        id: "members",
        accessorFn: (row) => row.memberCount,
        header: ({ column }) => (
          <SortHeaderButton label="Members" column={column} />
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const hasEditableGroups = groups.some((g) => g.origin === "local")

  const timestamp = connectionTimestamp(connection)
  const note = systemTypeNote(connection)
  const importFilename =
    connection?.kind === "import" ? connection.source_filename : null
  const isLms = kind === "canvas" || kind === "moodle"

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <GroupSetConnectionInfo
            timestamp={timestamp}
            importFilename={importFilename}
            isLms={isLms}
            note={note}
          />
          {isSetEditable && !hasEditableGroups && groups.length > 0 && (
            <p className="mb-2 text-xs text-muted-foreground">
              All groups in this set are read-only (LMS or system). Add new
              groups or import from CSV for editable groups.
            </p>
          )}
        </div>
        {isSetEditable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs shrink-0"
            onClick={onCreateGroup}
            disabled={disabled}
          >
            <Plus className="size-3 mr-1" />
            Add Group
          </Button>
        )}
      </div>
      {groups.length === 0 ? (
        <GroupsEmptyState kind={kind} />
      ) : (
        <>
          {/* Sortable column headers */}
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground border-b pb-1 mb-1">
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header) => (
                <div
                  key={header.id}
                  className={
                    header.id === "name" ? "flex-1" : "shrink-0 ml-auto"
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </div>
              )),
            )}
          </div>

          {/* Sorted groups */}
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
        </>
      )}
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
