import type {
  Group,
  GroupSelectionMode,
  GroupSelectionPreview,
  GroupSet,
  GroupSetConnection,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  EmptyState,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Separator,
  Text,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  HelpCircle,
  Info,
  Loader2,
  Lock,
  Plus,
  Redo2,
  RefreshCw,
  Trash2,
  Upload,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../../bindings/commands"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useOutputStore } from "../../../stores/outputStore"
import {
  selectCourse,
  selectGroupById,
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
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const updateGroupSetSelection = useProfileStore(
    (state) => state.updateGroupSetSelection,
  )
  const course = useProfileStore(selectCourse)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const appendOutput = useOutputStore((state) => state.appendText)
  const addToast = useToastStore((state) => state.addToast)

  // Dialog triggers from uiStore
  const groupSetOperation = useUiStore((state) => state.groupSetOperation)
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation)
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
  const isEditable = kind === "local" || kind === "import"
  const lmsContext = buildLmsOperationContext(lmsConnection, course.id)
  const isOperationActive = groupSetOperation !== null
  const isThisGroupSetBusy = groupSetOperation?.groupSetId === groupSetId
  const operationLabel =
    groupSetOperation?.kind === "sync" && isThisGroupSetBusy
      ? "Syncing group set..."
      : groupSetOperation?.kind === "reimport" && isThisGroupSetBusy
        ? "Re-importing group set..."
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
      {isEditable && kind !== "local" && (
        <div className="px-4 py-3 space-y-4">
          <GroupSelectionEditor
            groupSetId={groupSetId}
            groupSelection={groupSet.group_selection}
            onUpdateSelection={updateGroupSetSelection}
            disabled={isOperationActive}
          />
          <Separator />
          <ResolvedGroupsPreview
            groupSetId={groupSetId}
            groupSelection={groupSet.group_selection}
          />
          <Separator />
        </div>
      )}
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
  onCopy,
  onDelete,
  onReimport,
}: {
  kind: ReturnType<typeof getConnectionKind>
  isOperationActive: boolean
  isSyncing: boolean
  onSync: () => void
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

        {/* Re-import (imported only) */}
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
                Re-import
              </Button>
            </TooltipTrigger>
            <TooltipContent>Replace groups from a new CSV file</TooltipContent>
          </Tooltip>
        )}

        {/* Export (all types) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
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

// --- Group Selection Editor ---

function GroupSelectionEditor({
  groupSetId,
  groupSelection,
  onUpdateSelection,
  disabled,
}: {
  groupSetId: string
  groupSelection: GroupSelectionMode
  onUpdateSelection: (groupSetId: string, selection: GroupSelectionMode) => void
  disabled: boolean
}) {
  const mode = groupSelection.kind
  const pattern =
    groupSelection.kind === "pattern" ? groupSelection.pattern : ""
  const groups = useProfileStore(selectGroupsForGroupSet(groupSetId))

  const [localPattern, setLocalPattern] = useState(pattern)
  const [patternError, setPatternError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationRequestIdRef = useRef(0)

  // Sync local pattern when group selection changes
  useEffect(() => {
    if (groupSelection.kind === "pattern") {
      setLocalPattern(groupSelection.pattern)
      setPatternError(null)
    } else {
      setPatternError(null)
    }
  }, [groupSelection])

  const handleModeChange = useCallback(
    async (newMode: string) => {
      if (disabled) return
      if (newMode === mode) return

      if (newMode === "all") {
        onUpdateSelection(groupSetId, {
          kind: "all",
          excluded_group_ids: groupSelection.excluded_group_ids,
        })
        setPatternError(null)
      } else {
        try {
          const candidate = localPattern || "*"
          const groupNames = groups.map((group) => group.name)
          const validation = await commands.filterByPattern(
            candidate,
            groupNames,
          )
          if (validation.status !== "ok" || !validation.data.valid) {
            setPatternError(
              validation.status === "ok"
                ? (validation.data.error ?? "Invalid pattern")
                : validation.error.message,
            )
            return
          }

          onUpdateSelection(groupSetId, {
            kind: "pattern",
            pattern: candidate,
            excluded_group_ids: groupSelection.excluded_group_ids,
          })
          setPatternError(null)
        } catch (error) {
          setPatternError(
            error instanceof Error
              ? error.message
              : "Failed to validate pattern",
          )
        }
      }
    },
    [
      groupSetId,
      disabled,
      groups,
      mode,
      localPattern,
      groupSelection.excluded_group_ids,
      onUpdateSelection,
    ],
  )

  const commitPattern = useCallback(
    (value: string) => {
      onUpdateSelection(groupSetId, {
        kind: "pattern",
        pattern: value,
        excluded_group_ids: groupSelection.excluded_group_ids,
      })
    },
    [groupSetId, groupSelection.excluded_group_ids, onUpdateSelection],
  )

  const handlePatternChange = useCallback(
    (value: string) => {
      setLocalPattern(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          const requestId = ++validationRequestIdRef.current
          const groupNames = groups.map((group) => group.name)
          const result = await commands.filterByPattern(value, groupNames)
          if (validationRequestIdRef.current !== requestId) return

          if (result.status === "ok" && result.data.valid) {
            setPatternError(null)
            commitPattern(value)
            return
          }

          const message =
            result.status === "ok"
              ? (result.data.error ?? "Invalid pattern")
              : result.error.message
          setPatternError(message)
        } catch (error) {
          setPatternError(
            error instanceof Error
              ? error.message
              : "Failed to validate pattern",
          )
        }
      }, 400)
    },
    [commitPattern, groups],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const handleRestoreExcluded = useCallback(
    (groupId: string) => {
      if (disabled) return
      const newExcluded = groupSelection.excluded_group_ids.filter(
        (id) => id !== groupId,
      )
      onUpdateSelection(groupSetId, {
        ...groupSelection,
        excluded_group_ids: newExcluded,
      } as GroupSelectionMode)
    },
    [groupSetId, disabled, groupSelection, onUpdateSelection],
  )

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Group selection</Label>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="all"
            id={`sel-all-${groupSetId}`}
            disabled={disabled}
          />
          <Label htmlFor={`sel-all-${groupSetId}`} className="text-sm">
            All groups
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="pattern"
            id={`sel-pattern-${groupSetId}`}
            disabled={disabled}
          />
          <Label htmlFor={`sel-pattern-${groupSetId}`} className="text-sm">
            Pattern filter
          </Label>
        </div>
      </RadioGroup>

      {mode === "pattern" && (
        <div className="space-y-1.5 pl-6">
          <Input
            value={localPattern}
            disabled={disabled}
            onChange={(e) => handlePatternChange(e.target.value)}
            placeholder="e.g., 1D* or Team-*"
            className={cn("h-7 text-sm", patternError && "border-destructive")}
          />
          {patternError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="size-3" />
              {patternError}
            </p>
          )}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>Glob pattern matched against group names.</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3 shrink-0 cursor-help" />
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="start"
                  className="text-xs max-w-72 space-y-1"
                >
                  <p className="font-medium">Pattern syntax</p>
                  <p>
                    <code className="bg-muted px-0.5 rounded">*</code> matches
                    any characters,{" "}
                    <code className="bg-muted px-0.5 rounded">?</code> matches
                    one character
                  </p>
                  <p>
                    <code className="bg-muted px-0.5 rounded">[abc]</code>{" "}
                    matches a, b, or c;{" "}
                    <code className="bg-muted px-0.5 rounded">[!abc]</code>{" "}
                    matches anything else
                  </p>
                  <p>
                    Use <code className="bg-muted px-0.5 rounded">\</code> to
                    escape special characters
                  </p>
                  <p>
                    Not supported:{" "}
                    <code className="bg-muted px-0.5 rounded">**</code>,{" "}
                    <code className="bg-muted px-0.5 rounded">[^...]</code>, or
                    regular expressions
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Excluded groups */}
      <ExcludedGroupsList
        excludedIds={groupSelection.excluded_group_ids}
        disabled={disabled}
        onRestore={handleRestoreExcluded}
      />
    </div>
  )
}

// --- Excluded Groups List ---

function ExcludedGroupsList({
  excludedIds,
  disabled,
  onRestore,
}: {
  excludedIds: string[]
  disabled: boolean
  onRestore: (groupId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (excludedIds.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        {isOpen ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        Excluded ({excludedIds.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 space-y-1 pl-4">
        {excludedIds.map((id) => (
          <ExcludedGroupRow
            key={id}
            groupId={id}
            disabled={disabled}
            onRestore={onRestore}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function ExcludedGroupRow({
  groupId,
  disabled,
  onRestore,
}: {
  groupId: string
  disabled: boolean
  onRestore: (id: string) => void
}) {
  const group = useProfileStore(selectGroupById(groupId))

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="line-through text-muted-foreground truncate">
        {group?.name ?? groupId}
      </span>
      <button
        type="button"
        className="text-xs text-primary hover:underline shrink-0 flex items-center gap-0.5"
        disabled={disabled}
        onClick={() => onRestore(groupId)}
      >
        <Redo2 className="size-3" />
        Restore
      </button>
    </div>
  )
}

// --- Resolved Groups Preview ---

function ResolvedGroupsPreview({
  groupSetId,
  groupSelection,
}: {
  groupSetId: string
  groupSelection: GroupSelectionMode
}) {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const groups = useProfileStore(selectGroupsForGroupSet(groupSetId))
  const [preview, setPreview] = useState<GroupSelectionPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Fetch preview when group selection changes
  useEffect(() => {
    if (!roster) {
      setPreview(null)
      setPreviewError(null)
      return
    }

    let cancelled = false
    setLoading(true)

    commands
      .previewGroupSelection(roster, groupSetId, groupSelection)
      .then((result) => {
        if (cancelled) return
        if (result.status === "ok") {
          setPreview(result.data)
          setPreviewError(null)
        } else {
          setPreviewError(result.error.message)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setPreviewError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roster, groupSetId, groupSelection])

  // Build a group lookup for display
  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  )

  if (loading && !preview) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Resolved groups</Label>
        <Text className="text-xs text-muted-foreground">
          Loading preview...
        </Text>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Resolved groups</Label>
        {previewError ? (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3" />
            <span>Preview failed: {previewError}</span>
          </div>
        ) : (
          <Text className="text-xs text-muted-foreground">
            No preview available
          </Text>
        )}
      </div>
    )
  }

  if (!preview.valid) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Resolved groups</Label>
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3" />
          <span>Invalid pattern: {preview.error}</span>
        </div>
      </div>
    )
  }

  const emptyCount = preview.empty_group_ids.length
  const emptySet = new Set(preview.empty_group_ids)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Resolved groups</Label>
        <span className="text-xs text-muted-foreground">
          {preview.matched_groups} of {preview.total_groups} groups
          {emptyCount > 0 && ` (${emptyCount} empty)`}
        </span>
      </div>
      {loading && (
        <Text className="text-xs text-muted-foreground">
          Loading preview...
        </Text>
      )}
      {previewError && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3" />
          <span>Preview failed: {previewError}</span>
        </div>
      )}

      {preview.group_ids.length === 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          <span>
            {groupSelection.kind === "pattern"
              ? "No groups match this pattern"
              : "No groups match the current selection"}
          </span>
        </div>
      )}

      {preview.group_ids.length > 0 && (
        <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
          {preview.group_ids.map((gid) => {
            const group = groupMap.get(gid)
            const memberCount =
              preview.group_member_counts.find((c) => c.group_id === gid)
                ?.member_count ?? 0
            const isEmpty = emptySet.has(gid)

            return (
              <div
                key={gid}
                className="flex items-center justify-between px-3 py-1.5 text-sm"
              >
                <span
                  className={cn("truncate", isEmpty && "text-muted-foreground")}
                >
                  {group?.name ?? gid}
                </span>
                <span
                  className={cn(
                    "text-xs shrink-0 ml-2",
                    isEmpty
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  {memberCount} member{memberCount !== 1 ? "s" : ""}
                </span>
              </div>
            )
          })}
        </div>
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
