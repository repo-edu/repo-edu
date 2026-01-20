/**
 * Dialog for importing groups from LMS group sets.
 *
 * Supports two modes:
 * - Use cached group set (if any exist)
 * - Fetch from LMS (caches and applies)
 */

import type {
  GroupFilter,
  GroupImportConfig,
  LmsGroupSet,
} from "@repo-edu/backend-interface/types"
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Loader2 } from "@repo-edu/ui/components/icons"
import { useEffect, useMemo, useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"
import { buildLmsOperationContext } from "../../utils/operationContext"

type ImportMode = "cached" | "lms"

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

export function ImportGroupsDialog() {
  // Mode selection
  const [importMode, setImportMode] = useState<ImportMode>("cached")

  // LMS fetch state
  const [groupSets, setGroupSets] = useState<LmsGroupSet[]>([])
  const [selectedGroupSetId, setSelectedGroupSetId] = useState<string | null>(
    null,
  )
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [filterPattern, setFilterPattern] = useState("")
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set(),
  )
  const [fetchingGroupSets, setFetchingGroupSets] = useState(false)
  const [loadingGroups, setLoadingGroups] = useState(false)

  // Cached selection state
  const [selectedCachedSetId, setSelectedCachedSetId] = useState<string | null>(
    null,
  )

  // Shared state
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId =
    assignmentSelection?.mode === "assignment" ? assignmentSelection.id : null
  const setRoster = useProfileStore((state) => state.setRoster)
  const courseId = useProfileStore(
    (state) => state.document?.settings.course.id ?? "",
  )
  const addToast = useToastStore((state) => state.addToast)

  const open = useUiStore((state) => state.importGroupsDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGroupsDialogOpen)
  const setReplaceGroupsConfirmationOpen = useUiStore(
    (state) => state.setReplaceGroupsConfirmationOpen,
  )
  const setPendingGroupImport = useUiStore(
    (state) => state.setPendingGroupImport,
  )
  const setPendingGroupImportSource = useUiStore(
    (state) => state.setPendingGroupImportSource,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const lmsContext = useMemo(
    () => buildLmsOperationContext(lmsConnection, courseId),
    [lmsConnection, courseId],
  )
  const lmsContextError = !lmsConnection
    ? "No LMS connection configured"
    : !courseId.trim()
      ? "Profile has no course configured"
      : null

  // Cached group sets from roster
  const cachedGroupSets = roster?.lms_group_sets ?? []
  const hasCachedSets = cachedGroupSets.length > 0

  // Build a set of cached IDs for quick lookup
  const cachedSetIds = useMemo(
    () => new Set(cachedGroupSets.map((c) => c.id)),
    [cachedGroupSets],
  )

  // Default to cached mode if we have cached sets, otherwise LMS
  useEffect(() => {
    if (open) {
      setImportMode(hasCachedSets ? "cached" : "lms")
    }
  }, [open, hasCachedSets])

  const selectedGroupSet = groupSets.find((gs) => gs.id === selectedGroupSetId)
  const selectedCachedSet = cachedGroupSets.find(
    (c) => c.id === selectedCachedSetId,
  )

  const activeGroupsLoaded =
    importMode === "cached" ? Boolean(selectedCachedSet) : groupsLoaded

  const activeGroups = useMemo(() => {
    if (!activeGroupsLoaded) return []
    if (importMode === "cached") {
      return (
        selectedCachedSet?.groups.map((group) => ({
          id: group.id,
          name: group.name,
          member_ids: [...group.resolved_member_ids],
        })) ?? []
      )
    }
    return selectedGroupSet?.groups ?? []
  }, [activeGroupsLoaded, importMode, selectedCachedSet, selectedGroupSet])

  // Filter groups by pattern (only when groups are loaded)
  const filteredGroups = useMemo(() => {
    if (!activeGroupsLoaded) return []
    const groups = activeGroups
    if (!filterPattern.trim()) return groups
    // Simple glob-like matching: replace * with .*
    const pattern = filterPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
      .replace(/\*/g, ".*") // Replace * with .*
    const regex = new RegExp(`^${pattern}$`, "i")
    return groups.filter((g) => regex.test(g.name))
  }, [activeGroups, filterPattern, activeGroupsLoaded])

  useEffect(() => {
    setSelectedGroupIds(new Set())
    setFilterPattern("")
  }, [importMode, selectedGroupSetId, selectedCachedSetId])

  // Fetch group set list on open (quick - just names/ids)
  useEffect(() => {
    if (!open || !activeProfile || importMode !== "lms") return
    if (!lmsContext) {
      setError(lmsContextError)
      return
    }

    const fetchGroupSetList = async () => {
      setFetchingGroupSets(true)
      setGroupsLoaded(false)
      setError(null)
      try {
        const result = await commands.fetchLmsGroupSetList(lmsContext)
        if (result.status === "ok") {
          setGroupSets(result.data)
          // Auto-select if only one group set
          if (result.data.length === 1) {
            setSelectedGroupSetId(result.data[0].id)
          }
        } else {
          setError(result.error.message)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setFetchingGroupSets(false)
      }
    }

    fetchGroupSetList()
  }, [open, activeProfile, lmsContext, lmsContextError, importMode])

  // Fetch groups when a group set is selected (slower)
  useEffect(() => {
    if (
      importMode !== "lms" ||
      !selectedGroupSetId ||
      !activeProfile ||
      !lmsContext
    )
      return

    const fetchGroups = async () => {
      setLoadingGroups(true)
      setGroupsLoaded(false)
      setError(null)
      try {
        const result = await commands.fetchLmsGroupsForSet(
          lmsContext,
          selectedGroupSetId,
        )
        if (result.status === "ok") {
          // Update the selected group set with its groups
          setGroupSets((prev) =>
            prev.map((gs) =>
              gs.id === selectedGroupSetId
                ? { ...gs, groups: result.data }
                : gs,
            ),
          )
          setGroupsLoaded(true)
        } else {
          setError(result.error.message)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingGroups(false)
      }
    }

    fetchGroups()
  }, [selectedGroupSetId, activeProfile, lmsContext, importMode])

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const selectAllFiltered = () => {
    const ids = filteredGroups.map((g) => g.id)
    setSelectedGroupIds(new Set(ids))
  }

  const deselectAll = () => {
    setSelectedGroupIds(new Set())
  }

  const getImportConfig = (
    groupSetId: string | null,
  ): GroupImportConfig | null => {
    if (!groupSetId) return null

    let filter: GroupFilter
    if (selectedGroupIds.size > 0) {
      filter = { kind: "selected", selected: Array.from(selectedGroupIds) }
    } else if (filterPattern.trim()) {
      filter = { kind: "pattern", pattern: filterPattern }
    } else {
      filter = { kind: "all" }
    }

    return {
      group_set_id: groupSetId,
      filter,
    }
  }

  const handleImportFromLms = async () => {
    const config = getImportConfig(selectedGroupSetId)
    if (!config || !roster || !selectedAssignmentId || !activeProfile) return
    if (!lmsContext) {
      setError(lmsContextError)
      return
    }

    // Check if assignment has groups
    const assignment = roster.assignments.find(
      (a) => a.id === selectedAssignmentId,
    )
    if (assignment && assignment.groups.length > 0) {
      // Show confirmation dialog
      setPendingGroupImport(config)
      setPendingGroupImportSource("lms")
      setReplaceGroupsConfirmationOpen(true)
    } else {
      // Import directly
      await doImportFromLms(config)
    }
  }

  const doImportFromLms = async (config: GroupImportConfig) => {
    if (!roster || !selectedAssignmentId || !activeProfile || !lmsContext)
      return

    setImporting(true)
    setError(null)
    try {
      const result = await commands.importGroupsFromLms(
        lmsContext,
        roster,
        selectedAssignmentId,
        config,
      )
      if (result.status === "ok") {
        setRoster(result.data.roster, "Import groups from LMS")
        handleClose()
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  const handleImportFromCache = async () => {
    const config = getImportConfig(selectedCachedSetId)
    if (!roster || !selectedAssignmentId || !config) return

    // Check if assignment has groups
    const assignment = roster.assignments.find(
      (a) => a.id === selectedAssignmentId,
    )
    if (assignment && assignment.groups.length > 0) {
      // Show confirmation dialog
      setPendingGroupImport(config)
      setPendingGroupImportSource("cached")
      setReplaceGroupsConfirmationOpen(true)
    } else {
      await doImportFromCache(config)
    }
  }

  const doImportFromCache = async (config: GroupImportConfig) => {
    if (!roster || !selectedAssignmentId) return

    setImporting(true)
    setError(null)
    try {
      const result = await commands.applyCachedGroupSetToAssignment(
        roster,
        selectedAssignmentId,
        config,
      )
      if (result.status === "ok") {
        setRoster(result.data.roster, "Apply cached group set")
        addToast(
          `Applied "${selectedCachedSet?.name}" to assignment (${result.data.summary.groups_imported} groups)`,
        )
        handleClose()
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setGroupSets([])
    setSelectedGroupSetId(null)
    setSelectedCachedSetId(null)
    setGroupsLoaded(false)
    setFilterPattern("")
    setSelectedGroupIds(new Set())
    setError(null)
  }

  // Count for display
  const selectedCount =
    selectedGroupIds.size > 0 ? selectedGroupIds.size : filteredGroups.length
  const studentCount =
    selectedGroupIds.size > 0
      ? filteredGroups
          .filter((g) => selectedGroupIds.has(g.id))
          .reduce((acc, g) => acc + g.member_ids.length, 0)
      : filteredGroups.reduce((acc, g) => acc + g.member_ids.length, 0)

  const renderGroupFilterPanel = () => (
    <>
      <FormField
        label="Filter Pattern (optional)"
        description="Use * as a wildcard. Leave empty to select manually."
      >
        <Input
          placeholder="e.g., A1-* or Team-*"
          value={filterPattern}
          onChange={(e) => setFilterPattern(e.target.value)}
        />
      </FormField>

      <div className="grid gap-2">
        <div className="flex justify-between items-center">
          <Label>Groups</Label>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={selectAllFiltered}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={deselectAll}
            >
              Deselect all
            </button>
          </div>
        </div>
        <div className="border rounded-md max-h-48 overflow-y-auto">
          {filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">
              No groups match the filter
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div
                key={group.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
                role="option"
                aria-selected={selectedGroupIds.has(group.id)}
                onClick={() => toggleGroupSelection(group.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    toggleGroupSelection(group.id)
                  }
                }}
                tabIndex={0}
              >
                <Checkbox
                  checked={selectedGroupIds.has(group.id)}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggleGroupSelection(group.id)}
                  tabIndex={-1}
                />
                <span className="text-sm flex-1">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {group.member_ids.length} student
                  {group.member_ids.length !== 1 ? "s" : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {selectedCount} group{selectedCount !== 1 ? "s" : ""} selected (
        {studentCount} student{studentCount !== 1 ? "s" : ""})
      </p>
    </>
  )

  // Compute cached set stats
  const cachedSetStats = selectedCachedSet
    ? {
        groupCount: selectedCachedSet.groups.length,
        memberCount: selectedCachedSet.groups.reduce(
          (acc, g) => acc + g.resolved_member_ids.length,
          0,
        ),
        unresolvedCount: selectedCachedSet.groups.reduce(
          (acc, g) => acc + g.unresolved_count,
          0,
        ),
        needsReresolution: selectedCachedSet.groups.some(
          (g) => g.needs_reresolution,
        ),
        stale: isStale(selectedCachedSet.fetched_at),
      }
    : null

  const handleImport =
    importMode === "cached" ? handleImportFromCache : handleImportFromLms

  const canImport =
    importMode === "cached"
      ? selectedCachedSetId != null
      : selectedGroupSetId != null && groupsLoaded

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Groups</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Mode selection */}
          {hasCachedSets && (
            <FormField label="Import Source">
              <RadioGroup
                value={importMode}
                onValueChange={(v) => setImportMode(v as ImportMode)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cached" id="mode-cached" />
                  <Label htmlFor="mode-cached" className="cursor-pointer">
                    Use cached group set ({cachedGroupSets.length} available)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="lms" id="mode-lms" />
                  <Label htmlFor="mode-lms" className="cursor-pointer">
                    Fetch from LMS
                  </Label>
                </div>
              </RadioGroup>
            </FormField>
          )}

          {/* Cached mode UI */}
          {importMode === "cached" && (
            <>
              <FormField label="Cached Group Set">
                <Select
                  value={selectedCachedSetId ?? undefined}
                  onValueChange={setSelectedCachedSetId}
                  disabled={importing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cached group set" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {cachedGroupSets.map((cached) => {
                      const stale = isStale(cached.fetched_at)
                      const hasWarnings =
                        cached.groups.some((g) => g.needs_reresolution) ||
                        cached.groups.some((g) => g.unresolved_count > 0)
                      return (
                        <SelectItem key={cached.id} value={cached.id}>
                          <span className="flex items-center gap-2">
                            {cached.name}
                            {(stale || hasWarnings) && (
                              <AlertTriangle className="size-3 text-warning" />
                            )}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </FormField>

              {selectedCachedSet && cachedSetStats && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">
                      {selectedCachedSet.name}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cachedSetStats.groupCount} groups ·{" "}
                    {cachedSetStats.memberCount} members · fetched{" "}
                    {formatRelativeTime(selectedCachedSet.fetched_at)}
                  </div>
                  {cachedSetStats.stale && (
                    <div className="text-xs text-warning flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      Data may be outdated (over 24h old)
                    </div>
                  )}
                  {cachedSetStats.needsReresolution && (
                    <div className="text-xs text-warning flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      Members need re-resolution after roster changes
                    </div>
                  )}
                  {cachedSetStats.unresolvedCount > 0 &&
                    !cachedSetStats.needsReresolution && (
                      <div className="text-xs text-warning flex items-center gap-1">
                        <AlertTriangle className="size-3" />
                        {cachedSetStats.unresolvedCount} LMS user(s) could not
                        be matched to students
                      </div>
                    )}
                </div>
              )}

              {selectedCachedSet && renderGroupFilterPanel()}
            </>
          )}

          {/* LMS mode UI */}
          {importMode === "lms" && (
            <>
              <FormField label="LMS Group Set">
                {fetchingGroupSets ? (
                  <Text variant="muted" className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Loading group sets...
                  </Text>
                ) : groupSets.length === 0 ? (
                  <Text variant="muted" asChild>
                    <p>
                      No group sets found in this course. Create a group set in
                      your LMS first.
                    </p>
                  </Text>
                ) : (
                  <Select
                    value={selectedGroupSetId ?? undefined}
                    onValueChange={setSelectedGroupSetId}
                    disabled={importing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a group set" />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {groupSets.map((gs) => {
                        const isCached = cachedSetIds.has(gs.id)
                        return (
                          <SelectItem key={gs.id} value={gs.id}>
                            <span className="flex items-center gap-2">
                              {gs.name}
                              {isCached && (
                                <span className="text-xs text-muted-foreground">
                                  (cached)
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}
              </FormField>

              {selectedGroupSetId &&
                (loadingGroups ? (
                  <Text variant="muted" className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Loading groups...
                  </Text>
                ) : groupsLoaded ? (
                  renderGroupFilterPanel()
                ) : null)}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              !canImport || fetchingGroupSets || loadingGroups || importing
            }
          >
            {importing
              ? "Importing..."
              : importMode === "cached"
                ? "Apply Cached Set"
                : "Import Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
