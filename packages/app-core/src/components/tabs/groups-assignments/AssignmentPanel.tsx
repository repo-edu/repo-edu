import type {
  Assignment,
  AssignmentMetadata,
  GroupSelectionMode,
  GroupSelectionPreview,
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
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Redo2,
  Trash2,
  Users,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../../bindings/commands"
import {
  selectGroupById,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useProfileStore,
} from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"

interface AssignmentPanelProps {
  assignmentId: string
}

export function AssignmentPanel({ assignmentId }: AssignmentPanelProps) {
  const assignment = useProfileStore(
    (state) =>
      state.document?.roster?.assignments.find((a) => a.id === assignmentId) ??
      null,
  )
  const updateAssignment = useProfileStore((state) => state.updateAssignment)
  const deleteAssignment = useProfileStore((state) => state.deleteAssignment)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const setChangeGroupSetAssignmentId = useUiStore(
    (state) => state.setChangeGroupSetAssignmentId,
  )
  const isOperationActive = useUiStore(
    (state) => state.groupSetOperation !== null,
  )

  if (!assignment) {
    return (
      <EmptyState message="Assignment not found">
        <Text className="text-muted-foreground text-center">
          The selected assignment no longer exists.
        </Text>
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <AssignmentHeader
        assignment={assignment}
        onUpdate={updateAssignment}
        disabled={isOperationActive}
      />
      <Separator />
      <AssignmentToolbar
        disabled={isOperationActive}
        onChangeGroupSet={() => setChangeGroupSetAssignmentId(assignment.id)}
        onDelete={() => {
          deleteAssignment(assignment.id)
          setSidebarSelection(null)
        }}
      />
      <Separator />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <GroupSelectionEditor
          assignment={assignment}
          onUpdate={updateAssignment}
          disabled={isOperationActive}
        />
        <Separator />
        <ResolvedGroupsPreview assignment={assignment} />
      </div>
    </div>
  )
}

// --- Header ---

function AssignmentHeader({
  assignment,
  onUpdate,
  disabled,
}: {
  assignment: Assignment
  onUpdate: (id: string, updates: Partial<AssignmentMetadata>) => void
  disabled: boolean
}) {
  const groupSet = useProfileStore(selectGroupSetById(assignment.group_set_id))
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(assignment.name)
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
    <div className="px-4 py-3 space-y-1">
      <div className="flex items-center gap-2">
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
            className="h-7 text-base font-semibold px-1.5"
          />
        ) : (
          <button
            type="button"
            className="text-base font-semibold truncate hover:underline cursor-pointer text-left"
            onClick={() => {
              if (disabled) return
              setEditName(assignment.name)
              setIsEditing(true)
            }}
            disabled={disabled}
          >
            {assignment.name}
          </button>
        )}
      </div>

      {/* Parent group set link */}
      {groupSet && (
        <button
          type="button"
          className="text-xs text-primary hover:underline flex items-center gap-1"
          onClick={() =>
            setSidebarSelection({
              kind: "group-set",
              id: assignment.group_set_id,
            })
          }
        >
          <Users className="size-3" />
          {groupSet.name}
        </button>
      )}
      {!groupSet && (
        <p className="text-xs text-destructive">
          Referenced group set not found
        </p>
      )}

      {assignment.description && (
        <p className="text-xs text-muted-foreground">
          {assignment.description}
        </p>
      )}
    </div>
  )
}

// --- Toolbar ---

function AssignmentToolbar({
  disabled,
  onChangeGroupSet,
  onDelete,
}: {
  disabled: boolean
  onChangeGroupSet: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="px-4 py-2 flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onChangeGroupSet}
        disabled={disabled}
      >
        <ArrowRightLeft className="size-3 mr-1.5" />
        Change group set
      </Button>

      {confirmDelete ? (
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-destructive">Delete assignment?</span>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onDelete()
              setConfirmDelete(false)
            }}
            disabled={disabled}
          >
            Confirm
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setConfirmDelete(false)}
            disabled={disabled}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive ml-auto"
          onClick={() => setConfirmDelete(true)}
          disabled={disabled}
        >
          <Trash2 className="size-3 mr-1.5" />
          Delete
        </Button>
      )}
    </div>
  )
}

// --- Group Selection Editor ---

function GroupSelectionEditor({
  assignment,
  onUpdate,
  disabled,
}: {
  assignment: Assignment
  onUpdate: (id: string, updates: Partial<AssignmentMetadata>) => void
  disabled: boolean
}) {
  const sel = assignment.group_selection
  const mode = sel.kind
  const pattern = sel.kind === "pattern" ? sel.pattern : ""
  const groups = useProfileStore(
    selectGroupsForGroupSet(assignment.group_set_id),
  )

  const [localPattern, setLocalPattern] = useState(pattern)
  const [patternError, setPatternError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationRequestIdRef = useRef(0)

  // Sync local pattern when assignment changes
  useEffect(() => {
    if (sel.kind === "pattern") {
      setLocalPattern(sel.pattern)
      setPatternError(null)
    } else {
      setPatternError(null)
    }
  }, [sel])

  const handleModeChange = useCallback(
    async (newMode: string) => {
      if (disabled) return
      if (newMode === mode) return

      if (newMode === "all") {
        onUpdate(assignment.id, {
          group_selection: {
            kind: "all",
            excluded_group_ids: sel.excluded_group_ids,
          },
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

          onUpdate(assignment.id, {
            group_selection: {
              kind: "pattern",
              pattern: candidate,
              excluded_group_ids: sel.excluded_group_ids,
            },
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
      assignment.id,
      disabled,
      groups,
      mode,
      localPattern,
      sel.excluded_group_ids,
      onUpdate,
    ],
  )

  const commitPattern = useCallback(
    (value: string) => {
      onUpdate(assignment.id, {
        group_selection: {
          kind: "pattern",
          pattern: value,
          excluded_group_ids: sel.excluded_group_ids,
        },
      })
    },
    [assignment.id, sel.excluded_group_ids, onUpdate],
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
      const newExcluded = sel.excluded_group_ids.filter((id) => id !== groupId)
      onUpdate(assignment.id, {
        group_selection: {
          ...sel,
          excluded_group_ids: newExcluded,
        } as GroupSelectionMode,
      })
    },
    [assignment.id, disabled, sel, onUpdate],
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
            id={`sel-all-${assignment.id}`}
            disabled={disabled}
          />
          <Label htmlFor={`sel-all-${assignment.id}`} className="text-sm">
            All groups
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="pattern"
            id={`sel-pattern-${assignment.id}`}
            disabled={disabled}
          />
          <Label htmlFor={`sel-pattern-${assignment.id}`} className="text-sm">
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
        excludedIds={sel.excluded_group_ids}
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

function ResolvedGroupsPreview({ assignment }: { assignment: Assignment }) {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const groups = useProfileStore(
    selectGroupsForGroupSet(assignment.group_set_id),
  )
  const [preview, setPreview] = useState<GroupSelectionPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Fetch preview when assignment selection changes
  useEffect(() => {
    if (!roster) {
      setPreview(null)
      setPreviewError(null)
      return
    }

    let cancelled = false
    setLoading(true)

    commands
      .previewGroupSelection(
        roster,
        assignment.group_set_id,
        assignment.group_selection,
      )
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
  }, [roster, assignment.group_set_id, assignment.group_selection])

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
            {assignment.group_selection.kind === "pattern"
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
