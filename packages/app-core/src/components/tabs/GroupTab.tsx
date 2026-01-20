/**
 * GroupTab - Group set management with master-detail layout.
 * Left panel lists all group sets with status, right panel shows groups and actions.
 */

import type {
  CachedLmsGroup,
  LmsGroupSet,
  LmsGroupSetCacheEntry,
  Student,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  Text,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  Copy,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserX,
} from "@repo-edu/ui/components/icons"
import { useEffect, useMemo, useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { generateGroupId } from "../../utils/nanoid"
import { buildLmsOperationContext } from "../../utils/operationContext"
import { formatRelativeTime } from "../../utils/relativeTime"
import { StudentMultiSelect } from "../dialogs/StudentMultiSelect"
import { GroupList } from "../groups/GroupList"
import { UnassignedStudentsView } from "./assignment/UnassignedStudentsView"

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours
const EMPTY_STUDENTS: Student[] = []

type GroupSetSelection = { kind: "unassigned" } | { kind: "cached"; id: string }

type GroupSetListItem =
  | { source: "cached"; entry: LmsGroupSetCacheEntry }
  | { source: "lms"; entry: LmsGroupSet }

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false
  const fetchedTime = Date.parse(fetchedAt)
  if (Number.isNaN(fetchedTime)) return false
  return Date.now() - fetchedTime > STALENESS_THRESHOLD_MS
}

export function GroupTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const students = useProfileStore(
    (state) => state.document?.roster?.students ?? EMPTY_STUDENTS,
  )
  const setRoster = useProfileStore((state) => state.setRoster)
  const createLocalGroupSet = useProfileStore(
    (state) => state.createLocalGroupSet,
  )
  const renameLocalGroupSet = useProfileStore(
    (state) => state.renameLocalGroupSet,
  )
  const addLocalGroup = useProfileStore((state) => state.addLocalGroup)
  const updateLocalGroup = useProfileStore((state) => state.updateLocalGroup)
  const removeLocalGroup = useProfileStore((state) => state.removeLocalGroup)
  const courseId = useProfileStore(
    (state) => state.document?.settings.course.id ?? "",
  )
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const addToast = useToastStore((state) => state.addToast)
  const activeProfile = useUiStore((state) => state.activeProfile)
  const activeTab = useUiStore((state) => state.activeTab)
  const setImportGroupsDialogOpen = useUiStore(
    (state) => state.setImportGroupsDialogOpen,
  )

  const lmsContext = useMemo(
    () => buildLmsOperationContext(lmsConnection, courseId),
    [lmsConnection, courseId],
  )
  const lmsContextKey = useMemo(() => {
    if (!lmsConnection || !courseId.trim()) return null
    return `${lmsConnection.lms_type}|${lmsConnection.base_url}|${courseId}`
  }, [lmsConnection, courseId])

  const lmsContextError = !lmsConnection
    ? "No LMS connection configured"
    : !courseId.trim()
      ? "Profile has no course configured"
      : null

  const [selection, setSelection] = useState<GroupSetSelection | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [localSetName, setLocalSetName] = useState("")
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupDialogMode, setGroupDialogMode] = useState<"add" | "edit">("add")
  const [groupName, setGroupName] = useState("")
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [lmsGroupSets, setLmsGroupSets] = useState<LmsGroupSet[]>([])
  const [fetchingLmsGroupSets, setFetchingLmsGroupSets] = useState(false)
  const [lmsGroupSetsError, setLmsGroupSetsError] = useState<string | null>(
    null,
  )
  const [importingLmsSetId, setImportingLmsSetId] = useState<string | null>(
    null,
  )

  const cachedGroupSets = roster?.lms_group_sets ?? []

  const displayCachedGroupSets = useMemo(() => {
    return [...cachedGroupSets].sort((a, b) => a.name.localeCompare(b.name))
  }, [cachedGroupSets])

  const filteredCachedGroupSets = displayCachedGroupSets
  const selectableCachedGroupSets = useMemo(
    () => filteredCachedGroupSets.filter((set) => set.kind !== "unlinked"),
    [filteredCachedGroupSets],
  )

  const cachedLmsGroupSetIds = useMemo(() => {
    return new Set(
      cachedGroupSets
        .map((set) => set.lms_group_set_id)
        .filter((id): id is string => !!id),
    )
  }, [cachedGroupSets])

  const availableLmsGroupSets = useMemo(() => {
    if (cachedLmsGroupSetIds.size === 0) return lmsGroupSets
    return lmsGroupSets.filter((set) => !cachedLmsGroupSetIds.has(set.id))
  }, [cachedLmsGroupSetIds, lmsGroupSets])

  const displayLmsGroupSets = useMemo(() => {
    return [...availableLmsGroupSets].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [availableLmsGroupSets])

  const mergedGroupSets = useMemo<GroupSetListItem[]>(() => {
    const items = [
      ...displayCachedGroupSets.map((entry) => ({
        source: "cached" as const,
        entry,
      })),
      ...displayLmsGroupSets.map((entry) => ({
        source: "lms" as const,
        entry,
      })),
    ]
    return items.sort((a, b) => a.entry.name.localeCompare(b.entry.name))
  }, [displayCachedGroupSets, displayLmsGroupSets])

  useEffect(() => {
    if (selection?.kind === "unassigned") return
    if (
      selection?.kind === "cached" &&
      selectableCachedGroupSets.some((set) => set.id === selection.id)
    ) {
      return
    }
    if (selectableCachedGroupSets.length > 0) {
      setSelection({ kind: "cached", id: selectableCachedGroupSets[0].id })
    } else {
      setSelection(null)
    }
  }, [selectableCachedGroupSets, selection])

  useEffect(() => {
    if (!activeProfile) {
      setSelection(null)
      setLmsGroupSets([])
      setLmsGroupSetsError(null)
      setFetchingLmsGroupSets(false)
    }
  }, [activeProfile])

  useEffect(() => {
    if (!lmsContextKey) {
      setLmsGroupSets([])
      setLmsGroupSetsError(null)
      setFetchingLmsGroupSets(false)
      return
    }
    setLmsGroupSets([])
    setLmsGroupSetsError(null)
  }, [lmsContextKey])

  const fetchLmsGroupSets = async (force = false) => {
    if (fetchingLmsGroupSets) return
    if (!lmsContext || lmsContextError) {
      setLmsGroupSetsError(lmsContextError)
      return
    }
    const hasCachedGroupSets = cachedGroupSets.length > 0
    if (!force && (lmsGroupSets.length > 0 || hasCachedGroupSets)) return

    setFetchingLmsGroupSets(true)
    setLmsGroupSetsError(null)
    try {
      const result = await commands.fetchLmsGroupSetList(lmsContext)
      if (result.status === "ok") {
        setLmsGroupSets(result.data)
        mergeLmsGroupSetsIntoRoster(result.data)
      } else {
        setLmsGroupSetsError(result.error.message)
      }
    } catch (error) {
      setLmsGroupSetsError(
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setFetchingLmsGroupSets(false)
    }
  }

  useEffect(() => {
    if (activeTab !== "group" || !activeProfile) return
    fetchLmsGroupSets(false)
  }, [activeTab, activeProfile, lmsContextKey])

  const selectedCachedGroupSet =
    selection?.kind === "cached"
      ? displayCachedGroupSets.find((set) => set.id === selection.id)
      : null
  const showingUnassigned = selection?.kind === "unassigned"

  const handleRefresh = async () => {
    if (!selectedCachedGroupSet || !roster || !lmsContext) return
    if (selectedCachedGroupSet.kind !== "linked") return
    setRefreshingId(selectedCachedGroupSet.id)
    try {
      const result = await commands.refreshLinkedGroupSet(
        lmsContext,
        roster,
        selectedCachedGroupSet.id,
      )
      if (result.status === "ok") {
        setRoster(
          result.data,
          `Refresh group set "${selectedCachedGroupSet.name}"`,
        )
        addToast(`Refreshed "${selectedCachedGroupSet.name}"`)
      } else {
        addToast(`Refresh failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (error) {
      addToast(`Refresh failed: ${String(error)}`, { tone: "error" })
    } finally {
      setRefreshingId(null)
    }
  }

  const handleBreakSync = async () => {
    if (!selectedCachedGroupSet || !roster) return
    if (selectedCachedGroupSet.kind !== "linked") return
    const result = await commands.breakGroupSetLink(
      roster,
      selectedCachedGroupSet.id,
    )
    if (result.status === "ok") {
      setRoster(result.data, `Break sync for "${selectedCachedGroupSet.name}"`)
      addToast(
        `Sync broken; "${selectedCachedGroupSet.name}" is now editable`,
        {
          tone: "success",
        },
      )
    } else {
      addToast(`Break sync failed: ${result.error.message}`, { tone: "error" })
    }
  }

  const handleDeleteGroupSet = async () => {
    if (!selectedCachedGroupSet || !roster) return
    const result = await commands.deleteGroupSet(
      roster,
      selectedCachedGroupSet.id,
    )
    if (result.status === "ok") {
      setRoster(
        result.data,
        `Delete group set "${selectedCachedGroupSet.name}"`,
      )
      addToast(`Deleted "${selectedCachedGroupSet.name}"`, { tone: "warning" })
    } else {
      addToast(`Delete failed: ${result.error.message}`, { tone: "error" })
    }
  }

  const unassignedCount = useMemo(() => {
    const assignedStudentIds = new Set<string>()
    for (const groupSet of cachedGroupSets) {
      for (const group of groupSet.groups) {
        for (const memberId of group.resolved_member_ids) {
          assignedStudentIds.add(memberId)
        }
      }
    }
    return students.filter(
      (student) =>
        student.status === "active" && !assignedStudentIds.has(student.id),
    ).length
  }, [cachedGroupSets, students])

  const cachedGroups = selectedCachedGroupSet?.groups ?? []
  const groupListItems = useMemo(
    () =>
      cachedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        memberIds: group.resolved_member_ids,
        unresolvedCount: group.unresolved_count,
        needsResolution: group.needs_reresolution,
      })),
    [cachedGroups],
  )
  const totalMembers = useMemo(
    () =>
      cachedGroups.reduce(
        (acc, group) => acc + group.resolved_member_ids.length,
        0,
      ),
    [cachedGroups],
  )
  const unresolvedTotal = useMemo(
    () => cachedGroups.reduce((acc, group) => acc + group.unresolved_count, 0),
    [cachedGroups],
  )
  const editableLocalSet =
    selectedCachedGroupSet?.kind === "copied" ? selectedCachedGroupSet : null
  const isEditableSet = !!editableLocalSet

  const groupMemberships = useMemo(
    () =>
      editableLocalSet
        ? editableLocalSet.groups.map((group) => ({
            id: group.id,
            name: group.name,
            member_ids: group.resolved_member_ids,
          }))
        : [],
    [editableLocalSet],
  )

  const resolveContextKey = async () => {
    if (!lmsConnection || !courseId.trim()) {
      addToast(lmsContextError ?? "LMS connection required", { tone: "error" })
      return null
    }
    const result = await commands.normalizeContext(
      lmsConnection.lms_type,
      lmsConnection.base_url,
      courseId,
    )
    if (result.status === "ok") return result.data
    addToast(`Context error: ${result.error.message}`, { tone: "error" })
    return null
  }

  const handleCreateLocalSet = async () => {
    const contextKey = await resolveContextKey()
    if (!contextKey) return
    const setId = createLocalGroupSet(localSetName, contextKey)
    if (setId) {
      setSelection({ kind: "cached", id: setId })
      setCreateDialogOpen(false)
      setLocalSetName("")
    }
  }

  const handleRenameLocal = () => {
    if (!editableLocalSet) return
    renameLocalGroupSet(editableLocalSet.id, localSetName)
    setRenameDialogOpen(false)
  }

  const openAddGroupDialog = () => {
    setGroupDialogMode("add")
    setGroupName("")
    setGroupMembers([])
    setEditingGroupId(null)
    setGroupDialogOpen(true)
  }

  const openEditGroupDialog = (group: CachedLmsGroup) => {
    setGroupDialogMode("edit")
    setGroupName(group.name)
    setGroupMembers([...group.resolved_member_ids])
    setEditingGroupId(group.id)
    setGroupDialogOpen(true)
  }

  const handleSaveGroup = () => {
    if (!editableLocalSet) return
    const trimmed = groupName.trim()
    if (!trimmed) return
    if (groupDialogMode === "add") {
      const newGroup: CachedLmsGroup = {
        id: generateGroupId(),
        name: trimmed,
        lms_member_ids: [],
        resolved_member_ids: groupMembers,
        unresolved_count: 0,
        needs_reresolution: false,
      }
      addLocalGroup(editableLocalSet.id, newGroup)
    } else if (editingGroupId) {
      updateLocalGroup(editableLocalSet.id, editingGroupId, {
        name: trimmed,
        resolved_member_ids: groupMembers,
        lms_member_ids: [],
        unresolved_count: 0,
        needs_reresolution: false,
      })
    }
    setGroupDialogOpen(false)
    setGroupName("")
    setGroupMembers([])
    setEditingGroupId(null)
  }

  const handleImportLmsGroupSet = async (groupSet: LmsGroupSet) => {
    if (!lmsContext || lmsContextError) return
    setImportingLmsSetId(groupSet.id)
    const config = {
      group_set_id: groupSet.id,
      filter: { kind: "all" as const },
    }
    try {
      const result = await commands.linkLmsGroupSet(lmsContext, roster, config)
      if (result.status === "ok") {
        setRoster(result.data, "Link group set")
        const importedEntry = result.data.lms_group_sets?.find(
          (entry) => entry.lms_group_set_id === groupSet.id,
        )
        if (importedEntry) {
          setSelection({ kind: "cached", id: importedEntry.id })
        }
        addToast(`Linked "${groupSet.name}"`)
      } else {
        addToast(`Import failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (error) {
      addToast(`Import failed: ${String(error)}`, { tone: "error" })
    } finally {
      setImportingLmsSetId(null)
    }
  }

  const mergeLmsGroupSetsIntoRoster = (lmsSets: LmsGroupSet[]) => {
    if (!roster || !lmsContext) return
    const existing = roster.lms_group_sets ?? []
    const lmsById = new Map(lmsSets.map((set) => [set.id, set]))
    const lmsIds = new Set(lmsSets.map((set) => set.id))

    let changed = false
    const nextGroupSets: LmsGroupSetCacheEntry[] = []

    for (const entry of existing) {
      if (entry.kind === "unlinked") {
        const lmsId = entry.lms_group_set_id ?? entry.id
        if (!lmsId || !lmsIds.has(lmsId)) {
          changed = true
          continue
        }
        const lmsSet = lmsById.get(lmsId)
        if (lmsSet && lmsSet.name !== entry.name) {
          nextGroupSets.push({ ...entry, name: lmsSet.name })
          changed = true
        } else {
          nextGroupSets.push(entry)
        }
      } else {
        nextGroupSets.push(entry)
      }
    }

    const represented = new Set<string>()
    for (const entry of nextGroupSets) {
      const lmsId = entry.lms_group_set_id ?? entry.id
      if (lmsId) {
        represented.add(lmsId)
      }
    }

    for (const lmsSet of lmsSets) {
      if (represented.has(lmsSet.id)) continue
      nextGroupSets.push({
        id: lmsSet.id,
        kind: "unlinked",
        name: lmsSet.name,
        groups: [],
        filter: null,
        fetched_at: null,
        lms_group_set_id: lmsSet.id,
        lms_type: lmsContext.connection.lms_type,
        base_url: lmsContext.connection.base_url,
        course_id: lmsContext.course_id,
      })
      changed = true
    }

    if (!changed) return
    setRoster(
      { ...roster, lms_group_sets: nextGroupSets },
      "Cache LMS group sets",
    )
  }

  const handleReloadLmsGroupSets = () => {
    fetchLmsGroupSets(true)
  }

  return (
    <div className="flex h-full">
      {/* Left panel - Group set list */}
      <div className="flex flex-col h-full border-r w-64">
        <div className="flex items-center px-3 h-11 pb-3 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Group Sets
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleReloadLmsGroupSets}
              title="Reload LMS group sets"
              disabled={
                fetchingLmsGroupSets || !!lmsContextError || !lmsContext
              }
            >
              <RefreshCw
                className={`size-4 ${fetchingLmsGroupSets ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setImportGroupsDialogOpen(true)}
              title="Link or copy from LMS"
              disabled={!!lmsContextError}
            >
              <Layers className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCreateDialogOpen(true)}
              title="New copied group set"
              disabled={!!lmsContextError}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="px-2 pb-2">
          <button
            type="button"
            className={`w-full text-left rounded-md px-2 py-2 border ${
              selection?.kind === "unassigned"
                ? "bg-muted border-muted-foreground/30"
                : "border-transparent"
            } hover:bg-muted/50`}
            onClick={() => setSelection({ kind: "unassigned" })}
          >
            <div className="flex items-center gap-2">
              <UserX className="size-4 text-muted-foreground" />
              <span className="font-medium truncate">Unassigned students</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {unassignedCount}
              </span>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {mergedGroupSets.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No group sets available.
            </div>
          ) : (
            mergedGroupSets.map((item) => {
              if (item.source === "cached") {
                const set = item.entry
                const isUnlinked = set.kind === "unlinked"
                const selected =
                  selection?.kind === "cached" && set.id === selection.id
                const stale = set.kind === "linked" && isStale(set.fetched_at)
                const filtered = set.filter != null && set.filter.kind !== "all"
                const importing = isUnlinked && importingLmsSetId === set.id
                const importingOther =
                  isUnlinked &&
                  importingLmsSetId != null &&
                  importingLmsSetId !== set.id
                const statusLabel =
                  set.kind === "linked"
                    ? "Linked"
                    : set.kind === "copied"
                      ? "Copied"
                      : "Unlinked"
                return (
                  <button
                    key={set.id}
                    type="button"
                    className={`w-full text-left rounded-md px-2 py-2 border ${
                      selected || importing
                        ? "bg-muted border-muted-foreground/30"
                        : "border-transparent"
                    } hover:bg-muted/50`}
                    onClick={() => {
                      if (isUnlinked) {
                        handleImportLmsGroupSet({
                          id: set.lms_group_set_id ?? set.id,
                          name: set.name,
                          groups: [],
                        })
                        return
                      }
                      setSelection({ kind: "cached", id: set.id })
                    }}
                    disabled={
                      isUnlinked &&
                      (importing ||
                        importingOther ||
                        !!lmsContextError ||
                        !lmsContext)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-muted-foreground" />
                      <span className="font-medium truncate">{set.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{importing ? "Linking..." : statusLabel}</span>
                      {filtered && <span>· filtered</span>}
                      {stale && (
                        <span className="text-warning flex items-center gap-1">
                          <AlertTriangle className="size-3" />
                          stale
                        </span>
                      )}
                    </div>
                  </button>
                )
              }

              const set = item.entry
              const importing = importingLmsSetId === set.id
              const importingOther =
                importingLmsSetId != null && importingLmsSetId !== set.id
              return (
                <button
                  key={set.id}
                  type="button"
                  className={`w-full text-left rounded-md px-2 py-2 border ${
                    importing
                      ? "bg-muted border-muted-foreground/30"
                      : "border-transparent"
                  } hover:bg-muted/50`}
                  onClick={() => handleImportLmsGroupSet(set)}
                  disabled={
                    importing ||
                    importingOther ||
                    !!lmsContextError ||
                    !lmsContext
                  }
                >
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    <span className="font-medium truncate">{set.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{importing ? "Linking..." : "Unlinked"}</span>
                  </div>
                </button>
              )
            })
          )}
          {fetchingLmsGroupSets && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Loading LMS group sets...
            </div>
          )}
          {lmsContextError && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {lmsContextError}
            </div>
          )}
          {!lmsContextError && lmsGroupSetsError && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Failed to load LMS group sets: {lmsGroupSetsError}
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Group set detail */}
      <div className="flex-1 flex flex-col min-h-0">
        {showingUnassigned ? (
          <UnassignedStudentsView
            groupSets={cachedGroupSets}
            students={students}
          />
        ) : !selectedCachedGroupSet ? (
          <EmptyState message="Select a group set">
            <Text className="text-muted-foreground text-center">
              Choose a group set from the list to view its groups.
            </Text>
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 h-11 pb-3 border-b">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {selectedCachedGroupSet.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedCachedGroupSet.kind === "linked"
                    ? "Linked set"
                    : selectedCachedGroupSet.kind === "copied"
                      ? "Copied set"
                      : "Unlinked set"}{" "}
                  ·{" "}
                  {selectedCachedGroupSet.fetched_at
                    ? `synced ${formatRelativeTime(
                        selectedCachedGroupSet.fetched_at,
                      )}`
                    : "never synced"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedCachedGroupSet.kind === "linked" && (
                  <Button size="sm" variant="outline" onClick={handleBreakSync}>
                    <Copy className="mr-2 size-4" />
                    Break sync
                  </Button>
                )}
                {selectedCachedGroupSet.kind === "linked" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={
                      refreshingId === selectedCachedGroupSet.id || !lmsContext
                    }
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${
                        refreshingId === selectedCachedGroupSet.id
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    Sync now
                  </Button>
                )}
                {editableLocalSet && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLocalSetName(editableLocalSet.name)
                        setRenameDialogOpen(true)
                      }}
                    >
                      <Pencil className="mr-2 size-4" />
                      Rename
                    </Button>
                    <Button size="sm" onClick={openAddGroupDialog}>
                      <Plus className="mr-2 size-4" />
                      Add group
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDeleteGroupSet}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              </div>
            </div>

            <GroupList
              groups={groupListItems}
              students={students}
              editable={isEditableSet}
              onEditGroup={
                isEditableSet
                  ? (groupId) => {
                      const group = cachedGroups.find(
                        (item) => item.id === groupId,
                      )
                      if (group) {
                        openEditGroupDialog(group)
                      }
                    }
                  : undefined
              }
              onRemoveGroup={
                isEditableSet
                  ? (groupId) => removeLocalGroup(editableLocalSet.id, groupId)
                  : undefined
              }
              emptyMessage="No groups in this set."
              noResultsMessage="No groups match your search."
            />
            <div className="px-3 py-2 border-t text-sm text-muted-foreground">
              {cachedGroups.length} group{cachedGroups.length !== 1 ? "s" : ""}{" "}
              · {totalMembers} student{totalMembers !== 1 ? "s" : ""}
              {unresolvedTotal > 0 && (
                <span className="text-warning">
                  {" "}
                  · {unresolvedTotal} unresolved
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) setLocalSetName("")
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Copied Group Set</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <FormField label="Name" htmlFor="local-group-set-name">
              <Input
                id="local-group-set-name"
                placeholder="e.g., Resit Teams"
                value={localSetName}
                onChange={(e) => setLocalSetName(e.target.value)}
              />
            </FormField>
            {lmsContextError && (
              <Text className="text-warning text-sm">{lmsContextError}</Text>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateLocalSet}
              disabled={!localSetName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open)
          if (!open) setLocalSetName("")
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Group Set</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <FormField label="Name" htmlFor="rename-group-set-name">
              <Input
                id="rename-group-set-name"
                value={localSetName}
                onChange={(e) => setLocalSetName(e.target.value)}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameLocal} disabled={!localSetName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={groupDialogOpen}
        onOpenChange={(open) => {
          setGroupDialogOpen(open)
          if (!open) {
            setGroupName("")
            setGroupMembers([])
            setEditingGroupId(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {groupDialogMode === "add" ? "Add Group" : "Edit Group"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <FormField label="Group Name" htmlFor="local-group-name">
              <Input
                id="local-group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </FormField>
            <FormField label="Members">
              <StudentMultiSelect
                students={students}
                selected={groupMembers}
                onChange={setGroupMembers}
                groups={groupMemberships}
                currentGroupId={editingGroupId}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveGroup} disabled={!groupName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
