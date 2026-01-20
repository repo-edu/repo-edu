/**
 * Dialog for linking or copying LMS group sets into the roster.
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

type GroupSetMode = "link" | "copy"

export function ImportGroupsDialog() {
  const [mode, setMode] = useState<GroupSetMode>("link")
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const setRoster = useProfileStore((state) => state.setRoster)
  const courseId = useProfileStore(
    (state) => state.document?.settings.course.id ?? "",
  )
  const addToast = useToastStore((state) => state.addToast)

  const open = useUiStore((state) => state.importGroupsDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGroupsDialogOpen)
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

  const selectedGroupSet = groupSets.find((gs) => gs.id === selectedGroupSetId)
  const activeGroups = selectedGroupSet?.groups ?? []

  // Filter groups by pattern (only when groups are loaded)
  const filteredGroups = useMemo(() => {
    if (!groupsLoaded) return []
    if (!filterPattern.trim()) return activeGroups
    const pattern = filterPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
    const regex = new RegExp(`^${pattern}$`, "i")
    return activeGroups.filter((g) => regex.test(g.name))
  }, [activeGroups, filterPattern, groupsLoaded])

  useEffect(() => {
    if (!open || !activeProfile) return
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
  }, [open, activeProfile, lmsContext, lmsContextError])

  useEffect(() => {
    if (!selectedGroupSetId || !activeProfile || !lmsContext) return

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
  }, [selectedGroupSetId, activeProfile, lmsContext])

  useEffect(() => {
    setSelectedGroupIds(new Set())
    setFilterPattern("")
  }, [selectedGroupSetId])

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

  const handleSubmit = async () => {
    const config = getImportConfig(selectedGroupSetId)
    if (!config || !lmsContext) return

    setSubmitting(true)
    setError(null)
    try {
      const result =
        mode === "link"
          ? await commands.linkLmsGroupSet(lmsContext, roster, config)
          : await commands.copyLmsGroupSet(lmsContext, roster, config)
      if (result.status === "ok") {
        setRoster(
          result.data,
          mode === "link" ? "Link group set" : "Copy group set",
        )
        addToast(
          mode === "link"
            ? "Linked group set from LMS"
            : "Copied group set from LMS",
        )
        handleClose()
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setGroupSets([])
    setSelectedGroupSetId(null)
    setGroupsLoaded(false)
    setFilterPattern("")
    setSelectedGroupIds(new Set())
    setError(null)
  }

  const selectedCount =
    selectedGroupIds.size > 0 ? selectedGroupIds.size : filteredGroups.length
  const studentCount =
    selectedGroupIds.size > 0
      ? filteredGroups
          .filter((g) => selectedGroupIds.has(g.id))
          .reduce((acc, g) => acc + g.member_ids.length, 0)
      : filteredGroups.reduce((acc, g) => acc + g.member_ids.length, 0)

  const canSubmit = selectedGroupSetId != null && groupsLoaded

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Group Set</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <FormField label="Mode">
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as GroupSetMode)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="link" id="mode-link" />
                <Label htmlFor="mode-link" className="cursor-pointer">
                  Link group set (read-only)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="copy" id="mode-copy" />
                <Label htmlFor="mode-copy" className="cursor-pointer">
                  Copy group set (editable)
                </Label>
              </div>
            </RadioGroup>
          </FormField>

          <FormField label="LMS Group Set">
            <Select
              value={selectedGroupSetId ?? undefined}
              onValueChange={setSelectedGroupSetId}
              disabled={fetchingGroupSets || submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a group set" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {groupSets.map((groupSet) => (
                  <SelectItem key={groupSet.id} value={groupSet.id}>
                    {groupSet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fetchingGroupSets && (
              <Text className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Loading group sets...
              </Text>
            )}
            {!fetchingGroupSets &&
              groupSets.length === 0 &&
              lmsContextError === null && (
                <Text className="text-xs text-muted-foreground mt-2">
                  No group sets found in this course.
                </Text>
              )}
          </FormField>

          {selectedGroupSetId && (
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
                  {loadingGroups && (
                    <p className="text-sm text-muted-foreground p-3 text-center">
                      Loading groups...
                    </p>
                  )}
                  {!loadingGroups && filteredGroups.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3 text-center">
                      No groups match the filter
                    </p>
                  )}
                  {!loadingGroups &&
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
                    ))}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedCount} group{selectedCount !== 1 ? "s" : ""} selected (
                {studentCount} student{studentCount !== 1 ? "s" : ""})
              </p>
            </>
          )}

          {lmsContextError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <span>{lmsContextError}</span>
            </Alert>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Working..." : mode === "link" ? "Link" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
