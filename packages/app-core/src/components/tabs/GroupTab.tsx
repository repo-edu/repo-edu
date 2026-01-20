/**
 * GroupTab - LMS group set management with master-detail layout.
 * Left panel lists group sets (LMS + local), right panel caches and shows groups.
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
  Search,
  Trash2,
} from "@repo-edu/ui/components/icons"
import { useEffect, useMemo, useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { generateGroupId } from "../../utils/nanoid"
import { buildLmsOperationContext } from "../../utils/operationContext"
import { StudentMultiSelect } from "../dialogs/StudentMultiSelect"

type GroupSetListItem = {
  id: string
  name: string
  source: "lms" | "local"
  missingFromLms: boolean
  cachedEntry?: LmsGroupSetCacheEntry
}

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false
  const fetchedTime = Date.parse(fetchedAt)
  if (Number.isNaN(fetchedTime)) return false
  return Date.now() - fetchedTime > STALENESS_THRESHOLD_MS
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "—"
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function GroupTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const students = useProfileStore(
    (state) => state.document?.roster?.students ?? [],
  )
  const setRoster = useProfileStore((state) => state.setRoster)
  const createLocalGroupSet = useProfileStore(
    (state) => state.createLocalGroupSet,
  )
  const duplicateGroupSetAsLocal = useProfileStore(
    (state) => state.duplicateGroupSetAsLocal,
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

  const lmsContext = useMemo(
    () => buildLmsOperationContext(lmsConnection, courseId),
    [lmsConnection, courseId],
  )

  const lmsContextError = !lmsConnection
    ? "No LMS connection configured"
    : !courseId.trim()
      ? "Profile has no course configured"
      : null

  const [groupSets, setGroupSets] = useState<LmsGroupSet[]>([])
  const [fetchingList, setFetchingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedGroupSetId, setSelectedGroupSetId] = useState<string | null>(
    null,
  )
  const [loadingGroupSetId, setLoadingGroupSetId] = useState<string | null>(
    null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [localSetName, setLocalSetName] = useState("")
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupDialogMode, setGroupDialogMode] = useState<"add" | "edit">("add")
  const [groupName, setGroupName] = useState("")
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const cachedGroupSets = roster?.lms_group_sets ?? []

  const cachedById = useMemo(() => {
    return new Map(cachedGroupSets.map((entry) => [entry.id, entry]))
  }, [cachedGroupSets])

  const displayGroupSets = useMemo(() => {
    const lmsIds = new Set(groupSets.map((set) => set.id))
    const items: GroupSetListItem[] = groupSets.map((set) => ({
      id: set.id,
      name: set.name,
      source: "lms",
      missingFromLms: false,
      cachedEntry: cachedById.get(set.id),
    }))

    for (const entry of cachedGroupSets) {
      if (entry.origin === "local" || !lmsIds.has(entry.id)) {
        items.push({
          id: entry.id,
          name: entry.name,
          source: entry.origin === "local" ? "local" : "lms",
          missingFromLms: entry.origin !== "local" && !lmsIds.has(entry.id),
          cachedEntry: entry,
        })
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name))
    return items
  }, [groupSets, cachedGroupSets, cachedById])

  const filteredGroupSets = useMemo(() => {
    if (!searchQuery.trim()) return displayGroupSets
    const query = searchQuery.toLowerCase()
    return displayGroupSets.filter((set) =>
      set.name.toLowerCase().includes(query),
    )
  }, [displayGroupSets, searchQuery])

  useEffect(() => {
    if (filteredGroupSets.length === 0) return
    if (
      selectedGroupSetId &&
      filteredGroupSets.some((set) => set.id === selectedGroupSetId)
    ) {
      return
    }
    setSelectedGroupSetId(filteredGroupSets[0].id)
  }, [filteredGroupSets, selectedGroupSetId])

  const fetchGroupSetList = async () => {
    if (!lmsContext) {
      setListError(lmsContextError)
      return
    }

    setFetchingList(true)
    setListError(null)
    try {
      const result = await commands.fetchLmsGroupSetList(lmsContext)
      if (result.status === "ok") {
        setGroupSets(result.data)
      } else {
        setListError(result.error.message)
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : String(error))
    } finally {
      setFetchingList(false)
    }
  }

  useEffect(() => {
    if (!activeProfile) {
      setGroupSets([])
      setSelectedGroupSetId(null)
      return
    }
    if (!lmsContext) {
      setGroupSets([])
      setListError(lmsContextError)
      return
    }
    fetchGroupSetList()
  }, [activeProfile, lmsContext, lmsContextError])

  const selectedItem = displayGroupSets.find(
    (set) => set.id === selectedGroupSetId,
  )
  const selectedCachedEntry = selectedItem?.cachedEntry ?? null

  useEffect(() => {
    if (!selectedItem) return
    if (selectedItem.source === "local") return
    if (selectedItem.cachedEntry) return
    if (!roster || !lmsContext) return
    if (loadingGroupSetId === selectedItem.id) return

    const cacheGroupSet = async () => {
      setLoadingGroupSetId(selectedItem.id)
      setLoadError(null)
      try {
        const result = await commands.cacheLmsGroupSet(
          lmsContext,
          roster,
          selectedItem.id,
        )
        if (result.status === "ok") {
          setRoster(result.data, `Cache group set "${selectedItem.name}"`)
          addToast(`Cached "${selectedItem.name}" from LMS`)
        } else {
          setLoadError(result.error.message)
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error))
      } finally {
        setLoadingGroupSetId(null)
      }
    }

    cacheGroupSet()
  }, [selectedItem, roster, lmsContext, addToast, loadingGroupSetId, setRoster])

  const handleRefresh = async () => {
    if (!selectedCachedEntry || !roster || !lmsContext) return
    if (selectedCachedEntry.origin !== "lms") return
    setRefreshingId(selectedCachedEntry.id)
    try {
      const result = await commands.refreshCachedLmsGroupSet(
        lmsContext,
        roster,
        selectedCachedEntry.id,
      )
      if (result.status === "ok") {
        setRoster(
          result.data,
          `Refresh group set "${selectedCachedEntry.name}"`,
        )
        addToast(`Refreshed "${selectedCachedEntry.name}"`)
      } else {
        addToast(`Refresh failed: ${result.error.message}`, { tone: "error" })
      }
    } catch (error) {
      addToast(`Refresh failed: ${String(error)}`, { tone: "error" })
    } finally {
      setRefreshingId(null)
    }
  }

  const studentMap = useMemo(() => {
    return new Map(students.map((student) => [student.id, student]))
  }, [students])

  const cachedGroups = selectedCachedEntry?.groups ?? []
  const canFetchGroups = !!roster && !!lmsContext
  const editableLocalSet =
    selectedCachedEntry?.origin === "local" ? selectedCachedEntry : null

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
      setSelectedGroupSetId(setId)
      setCreateDialogOpen(false)
      setLocalSetName("")
    }
  }

  const handleDuplicateLocal = async () => {
    if (!selectedCachedEntry) return
    const contextKey = await resolveContextKey()
    if (!contextKey) return
    const setId = duplicateGroupSetAsLocal(selectedCachedEntry.id, contextKey)
    if (setId) {
      setSelectedGroupSetId(setId)
      addToast(`Created local copy of "${selectedCachedEntry.name}"`)
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
              onClick={() => setCreateDialogOpen(true)}
              title="New local group set"
              disabled={!!lmsContextError}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={fetchGroupSetList}
              disabled={fetchingList || !lmsContext}
              title="Refresh group set list"
            >
              <RefreshCw
                className={`size-4 ${fetchingList ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search group sets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {listError && (
            <div className="px-2 py-2 text-xs text-warning flex items-center gap-2">
              <AlertTriangle className="size-3" />
              {listError}
            </div>
          )}

          {filteredGroupSets.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No group sets available.
            </div>
          ) : (
            filteredGroupSets.map((set) => {
              const selected = set.id === selectedGroupSetId
              const cached = !!set.cachedEntry
              const stale = cached
                ? isStale(set.cachedEntry?.fetched_at ?? null)
                : false
              return (
                <button
                  key={set.id}
                  type="button"
                  className={`w-full text-left rounded-md px-2 py-2 border ${
                    selected
                      ? "bg-muted border-muted-foreground/30"
                      : "border-transparent"
                  } hover:bg-muted/50`}
                  onClick={() => setSelectedGroupSetId(set.id)}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    <span className="font-medium truncate">{set.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{set.source === "local" ? "Local" : "LMS"}</span>
                    {cached && <span>· cached</span>}
                    {stale && (
                      <span className="text-warning flex items-center gap-1">
                        <AlertTriangle className="size-3" />
                        stale
                      </span>
                    )}
                    {set.missingFromLms && (
                      <span className="text-warning">· missing from LMS</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right panel - Group set detail */}
      <div className="flex-1 flex flex-col min-h-0">
        {!selectedItem ? (
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
                  {selectedItem.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedItem.source === "local" ? "Local set" : "LMS set"} ·{" "}
                  {selectedCachedEntry
                    ? `fetched ${formatRelativeTime(selectedCachedEntry.fetched_at)}`
                    : "not cached"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedCachedEntry?.origin === "lms" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDuplicateLocal}
                  >
                    <Copy className="mr-2 size-4" />
                    Duplicate as local
                  </Button>
                )}
                {selectedCachedEntry?.origin === "lms" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={
                      refreshingId === selectedCachedEntry.id || !lmsContext
                    }
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${
                        refreshingId === selectedCachedEntry.id
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    Refresh
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
              </div>
            </div>

            {!selectedCachedEntry && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                {!canFetchGroups ? (
                  <div className="text-center space-y-2">
                    <div>{lmsContextError ?? "No roster loaded."}</div>
                  </div>
                ) : loadingGroupSetId === selectedItem.id ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-4 animate-spin" />
                    Fetching groups from LMS...
                  </div>
                ) : loadError ? (
                  <div className="text-center space-y-2">
                    <div className="text-warning">{loadError}</div>
                    <Button
                      onClick={() => setSelectedGroupSetId(selectedItem.id)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-4 animate-spin" />
                    Fetching groups from LMS...
                  </div>
                )}
              </div>
            )}

            {selectedCachedEntry && (
              <GroupSetGroupsPane
                groups={cachedGroups}
                studentMap={studentMap}
                editable={!!editableLocalSet}
                onEditGroup={openEditGroupDialog}
                onRemoveGroup={(group) =>
                  editableLocalSet
                    ? removeLocalGroup(editableLocalSet.id, group.id)
                    : null
                }
              />
            )}
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
            <DialogTitle>New Local Group Set</DialogTitle>
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

interface GroupSetGroupsPaneProps {
  groups: CachedLmsGroup[]
  studentMap: Map<string, Student>
  editable?: boolean
  onEditGroup?: (group: CachedLmsGroup) => void
  onRemoveGroup?: (group: CachedLmsGroup) => void
}

function GroupSetGroupsPane({
  groups,
  studentMap,
  editable = false,
  onEditGroup,
  onRemoveGroup,
}: GroupSetGroupsPaneProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const totalMembers = groups.reduce(
    (acc, group) => acc + group.resolved_member_ids.length,
    0,
  )
  const unresolvedTotal = groups.reduce(
    (acc, group) => acc + group.unresolved_count,
    0,
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b text-sm text-muted-foreground">
        {groups.length} group{groups.length !== 1 ? "s" : ""} · {totalMembers}{" "}
        resolved member{totalMembers !== 1 ? "s" : ""}
        {unresolvedTotal > 0 && (
          <span className="text-warning"> · {unresolvedTotal} unresolved</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {groups.length === 0 ? (
          <div className="text-muted-foreground text-center py-4">
            No groups in this set.
          </div>
        ) : (
          groups.map((group) => {
            const resolvedMembers = group.resolved_member_ids.map((id) => {
              const student = studentMap.get(id)
              return student?.name ?? `Unknown (${id})`
            })
            const expanded = expandedGroups.has(group.id)
            return (
              <div key={group.id} className="border rounded-md">
                <div className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => toggleExpand(group.id)}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{group.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {resolvedMembers.length} resolved
                        {group.unresolved_count > 0 && (
                          <span className="text-warning">
                            {" "}
                            · {group.unresolved_count} unresolved
                          </span>
                        )}
                        {group.needs_reresolution && (
                          <span className="text-warning flex items-center gap-1">
                            <AlertTriangle className="inline size-3" />
                            needs re-resolution
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => onEditGroup?.(group)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => onRemoveGroup?.(group)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="border-t px-3 py-2 text-sm text-muted-foreground">
                    {resolvedMembers.length === 0 ? (
                      <div>No resolved members.</div>
                    ) : (
                      <ul className="space-y-1">
                        {resolvedMembers.map((name, idx) => (
                          <li key={`${group.id}-${idx}`}>{name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
