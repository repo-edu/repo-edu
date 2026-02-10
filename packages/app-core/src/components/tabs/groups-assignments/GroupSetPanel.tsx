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
  cn,
  EmptyState,
  Input,
  Separator,
  Text,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  Copy,
  File,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../../bindings/commands"
import { saveDialog } from "../../../services/platform"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useOutputStore } from "../../../stores/outputStore"
import {
  selectAssignmentsForGroupSet,
  selectCourse,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useProfileStore,
} from "../../../stores/profileStore"
import { useToastStore } from "../../../stores/toastStore"
import { useUiStore } from "../../../stores/uiStore"
import { applyGroupSetPatch } from "../../../utils/groupSetPatch"
import { buildLmsOperationContext } from "../../../utils/operationContext"
import {
  formatExactTimestamp,
  formatRelativeTime,
} from "../../../utils/relativeTime"
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

function connectionBadgeLabel(kind: ReturnType<typeof getConnectionKind>) {
  switch (kind) {
    case "system":
      return "System"
    case "canvas":
      return "Canvas"
    case "moodle":
      return "Moodle"
    case "import":
      return "Import"
    case "local":
      return "Local"
  }
}

function connectionBadgeTooltip(kind: ReturnType<typeof getConnectionKind>) {
  switch (kind) {
    case "system":
      return "Auto-managed group set. Cannot be edited or deleted."
    case "canvas":
      return "Synced from Canvas LMS. Groups are read-only."
    case "moodle":
      return "Synced from Moodle LMS. Groups are read-only."
    case "import":
      return "Imported from CSV. Groups are editable."
    case "local":
      return "Locally created. Groups are fully editable."
  }
}

function badgeColorClass(kind: ReturnType<typeof getConnectionKind>) {
  switch (kind) {
    case "system":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
    case "canvas":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
    case "moodle":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
    case "import":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
    case "local":
      return "bg-muted text-muted-foreground"
  }
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
  const setNewAssignmentDialogOpen = useUiStore(
    (state) => state.setNewAssignmentDialogOpen,
  )
  const setPreSelectedGroupSetId = useUiStore(
    (state) => state.setPreSelectedGroupSetId,
  )
  const setCopyGroupSetSourceId = useUiStore(
    (state) => state.setCopyGroupSetSourceId,
  )
  const setDeleteGroupSetTargetId = useUiStore(
    (state) => state.setDeleteGroupSetTargetId,
  )
  const setReimportGroupSetTargetId = useUiStore(
    (state) => state.setReimportGroupSetTargetId,
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

  return (
    <div className="flex flex-col h-full">
      <GroupSetHeader
        groupSet={groupSet}
        connection={connection}
        kind={kind}
        isOperationActive={isOperationActive}
      />
      <Separator />
      <GroupSetToolbar
        kind={kind}
        isOperationActive={isOperationActive}
        isSyncing={groupSetOperation?.kind === "sync" && isThisGroupSetBusy}
        onSync={handleSync}
        onExport={handleExport}
        onCopy={() => setCopyGroupSetSourceId(groupSetId)}
        onDelete={() => setDeleteGroupSetTargetId(groupSetId)}
        onReimport={() => setReimportGroupSetTargetId(groupSetId)}
      />
      {operationLabel && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          <span>{operationLabel}</span>
        </div>
      )}
      <Separator />
      <AssignmentsSection
        assignments={assignments}
        disabled={isOperationActive}
        onAdd={() => {
          setPreSelectedGroupSetId(groupSetId)
          setNewAssignmentDialogOpen(true)
        }}
        onUpdate={updateAssignment}
        onDelete={deleteAssignment}
      />
      <Separator />
      <GroupsList
        groupSet={groupSet}
        groups={groups}
        kind={kind}
        roster={roster}
        disabled={isOperationActive}
        onDeleteGroup={(gid) => setDeleteGroupTargetId(gid)}
        onCreateGroup={() => setAddGroupDialogGroupSetId(groupSetId)}
      />
    </div>
  )
}

// --- Header ---

function GroupSetHeader({
  groupSet,
  connection,
  kind,
  isOperationActive,
}: {
  groupSet: GroupSet
  connection: GroupSetConnection | null
  kind: ReturnType<typeof getConnectionKind>
  isOperationActive: boolean
}) {
  const renameGroupSet = useProfileStore((state) => state.renameGroupSet)
  const isNameEditable = kind === "local" || kind === "import"
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(groupSet.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== groupSet.name) {
      renameGroupSet(groupSet.id, trimmed)
    }
    setIsEditing(false)
  }, [editName, groupSet.name, groupSet.id, renameGroupSet])

  // Sync local name with store when group set name changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditName(groupSet.name)
    }
  }, [groupSet.name, isEditing])

  useEffect(() => {
    if (isOperationActive) {
      setIsEditing(false)
    }
  }, [isOperationActive])

  const timestamp = connectionTimestamp(connection)
  const note = systemTypeNote(connection)
  const importFilename =
    connection?.kind === "import" ? connection.source_filename : null

  return (
    <div className="px-4 py-3 space-y-1">
      <div className="flex items-center gap-2">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editName}
            disabled={isOperationActive}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave()
              if (e.key === "Escape") {
                setIsEditing(false)
                setEditName(groupSet.name)
              }
            }}
            className="h-7 text-base font-semibold px-1.5"
          />
        ) : isNameEditable ? (
          <button
            type="button"
            className="text-base font-semibold truncate hover:underline cursor-pointer text-left"
            onClick={() => {
              if (!isOperationActive) {
                setIsEditing(true)
              }
            }}
            disabled={isOperationActive}
          >
            {groupSet.name}
          </button>
        ) : (
          <span className="text-base font-semibold truncate">
            {groupSet.name}
          </span>
        )}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default",
                  badgeColorClass(kind),
                )}
              >
                {connectionBadgeLabel(kind)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-64">
              {connectionBadgeTooltip(kind)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {timestamp && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground cursor-default w-fit">
                {timestamp.relative}
              </p>
            </TooltipTrigger>
            {timestamp.exact && (
              <TooltipContent side="bottom" className="text-xs">
                {timestamp.exact}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
      {importFilename && (
        <p className="text-xs text-muted-foreground">
          Source: {importFilename}
        </p>
      )}

      {/* LMS header tooltip */}
      {(kind === "canvas" || kind === "moodle") && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          <span>
            Sync from LMS to update groups. Copy to create a local set.
          </span>
        </div>
      )}

      {note && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3 shrink-0" />
          <span>{note}</span>
        </div>
      )}
    </div>
  )
}

// --- Toolbar ---

function copyTooltipText(kind: ReturnType<typeof getConnectionKind>): string {
  if (kind === "canvas" || kind === "moodle" || kind === "system") {
    return "Create a local copy referencing the same groups. Shared groups will reflect future sync updates."
  }
  return "Create a local copy referencing the same groups"
}

function GroupSetToolbar({
  kind,
  isOperationActive,
  isSyncing,
  onSync,
  onExport,
  onCopy,
  onDelete,
  onReimport,
}: {
  kind: ReturnType<typeof getConnectionKind>
  isOperationActive: boolean
  isSyncing: boolean
  onSync: () => void
  onExport: () => void
  onCopy: () => void
  onDelete: () => void
  onReimport: () => void
}) {
  const isSystem = kind === "system"
  const isLms = kind === "canvas" || kind === "moodle"
  const isImported = kind === "import"

  return (
    <TooltipProvider delayDuration={300}>
      <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap">
        {/* Sync (LMS only) */}
        {isLms && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onSync}
                disabled={isOperationActive}
              >
                <RefreshCw
                  className={cn("size-3 mr-1.5", isSyncing && "animate-spin")}
                />
                {isSyncing ? "Syncing..." : "Sync"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fetch latest groups from LMS</TooltipContent>
          </Tooltip>
        )}

        {/* Import (imported only) */}
        {isImported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onReimport}
                disabled={isOperationActive}
              >
                <Upload className="size-3 mr-1.5" />
                Import
              </Button>
            </TooltipTrigger>
            <TooltipContent>Replace groups from a CSV file</TooltipContent>
          </Tooltip>
        )}

        {/* Export (all types) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onExport}
              disabled={isOperationActive}
            >
              <Upload className="size-3 mr-1.5 rotate-180" />
              Export
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export groups to CSV</TooltipContent>
        </Tooltip>

        {/* Copy (all types) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onCopy}
              disabled={isOperationActive}
            >
              <Copy className="size-3 mr-1.5" />
              Copy
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            {copyTooltipText(kind)}
          </TooltipContent>
        </Tooltip>

        {/* Delete (not for system sets) */}
        {!isSystem && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive ml-auto"
            onClick={onDelete}
            disabled={isOperationActive}
          >
            <Trash2 className="size-3 mr-1.5" />
            Delete
          </Button>
        )}
      </div>
    </TooltipProvider>
  )
}

// --- Assignments Section ---

function AssignmentsSection({
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
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Assignments
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={onAdd}
          disabled={disabled}
        >
          <Plus className="size-3 mr-1" />
          Add
        </Button>
      </div>
      {assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No assignments yet</p>
      ) : (
        <div className="space-y-1">
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
    <div className="flex items-center gap-1.5 group rounded-md px-1.5 py-1 hover:bg-muted/50">
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
          className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
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

  // Resolve members for each group
  const resolveMembers = useCallback(
    (group: Group): RosterMember[] => {
      return group.member_ids
        .map((id) => memberMap.get(id))
        .filter((m): m is RosterMember => !!m)
    },
    [memberMap],
  )

  if (groups.length === 0) {
    const isSystem = kind === "system"
    const isLms = kind === "canvas" || kind === "moodle"
    const emptyMessage = isSystem
      ? "Add students to the roster to see individual groups"
      : isLms
        ? "Sync from LMS to load groups"
        : "Add groups to this set"

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
        <Text className="text-sm text-muted-foreground">{emptyMessage}</Text>
        {isSetEditable && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateGroup}
            disabled={disabled}
          >
            <Plus className="size-3 mr-1.5" />
            Add group
          </Button>
        )}
      </div>
    )
  }

  const hasEditableGroups = groups.some((g) => g.origin === "local")

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {/* Add group button */}
      {isSetEditable && (
        <Button
          variant="outline"
          size="sm"
          className="mb-2"
          onClick={onCreateGroup}
          disabled={disabled}
        >
          <Plus className="size-3 mr-1.5" />
          Add group
        </Button>
      )}

      {/* All non-local origins notice */}
      {isSetEditable && !hasEditableGroups && groups.length > 0 && (
        <p className="text-xs text-muted-foreground">
          All groups in this set are read-only (LMS or system). Add new groups
          or import from CSV for editable groups.
        </p>
      )}

      {groups.map((group) => (
        <GroupItem
          key={group.id}
          group={group}
          groupSetId={groupSet.id}
          members={resolveMembers(group)}
          staffIds={staffIds}
          isSetEditable={isSetEditable}
          disabled={disabled}
          onDeleteGroup={() => onDeleteGroup(group.id)}
        />
      ))}
    </div>
  )
}
