/**
 * Dialog for importing groups from LMS group sets.
 */

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useEffect, useMemo, useState } from "react"
import { commands } from "../../bindings/commands"
import type {
  GroupFilter,
  GroupImportConfig,
  LmsGroupSet,
} from "../../bindings/types"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function ImportGroupsDialog() {
  const [groupSets, setGroupSets] = useState<LmsGroupSet[]>([])
  const [selectedGroupSetId, setSelectedGroupSetId] = useState<string | null>(
    null,
  )
  const [filterPattern, setFilterPattern] = useState("")
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set(),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useRosterStore((state) => state.roster)
  const selectedAssignmentId = useRosterStore(
    (state) => state.selectedAssignmentId,
  )
  const setRoster = useRosterStore((state) => state.setRoster)

  const open = useUiStore((state) => state.importGroupsDialogOpen)
  const setOpen = useUiStore((state) => state.setImportGroupsDialogOpen)
  const setReplaceGroupsConfirmationOpen = useUiStore(
    (state) => state.setReplaceGroupsConfirmationOpen,
  )
  const setPendingGroupImport = useUiStore(
    (state) => state.setPendingGroupImport,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)

  const selectedGroupSet = groupSets.find((gs) => gs.id === selectedGroupSetId)

  // Filter groups by pattern
  const filteredGroups = useMemo(() => {
    const groups = selectedGroupSet?.groups ?? []
    if (!filterPattern.trim()) return groups
    // Simple glob-like matching: replace * with .*
    const pattern = filterPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
      .replace(/\*/g, ".*") // Replace * with .*
    const regex = new RegExp(`^${pattern}$`, "i")
    return groups.filter((g) => regex.test(g.name))
  }, [selectedGroupSet, filterPattern])

  // Fetch group sets on open
  useEffect(() => {
    if (open && activeProfile) {
      setLoading(true)
      setError(null)
      commands
        .fetchLmsGroupSets(activeProfile)
        .then((result) => {
          if (result.status === "ok") {
            setGroupSets(result.data)
          } else {
            setError(result.error.message)
          }
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false))
    }
  }, [open, activeProfile])

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

  const getImportConfig = (): GroupImportConfig | null => {
    if (!selectedGroupSetId) return null

    let filter: GroupFilter
    if (selectedGroupIds.size > 0) {
      filter = { kind: "selected", selected: Array.from(selectedGroupIds) }
    } else if (filterPattern.trim()) {
      filter = { kind: "pattern", pattern: filterPattern }
    } else {
      filter = { kind: "all" }
    }

    return {
      group_set_id: selectedGroupSetId,
      filter,
    }
  }

  const handleImport = async () => {
    const config = getImportConfig()
    if (!config || !roster || !selectedAssignmentId || !activeProfile) return

    // Check if assignment has groups
    const assignment = roster.assignments.find(
      (a) => a.id === selectedAssignmentId,
    )
    if (assignment && assignment.groups.length > 0) {
      // Show confirmation dialog
      setPendingGroupImport(config)
      setReplaceGroupsConfirmationOpen(true)
    } else {
      // Import directly
      await doImport(config)
    }
  }

  const doImport = async (config: GroupImportConfig) => {
    if (!roster || !selectedAssignmentId || !activeProfile) return

    setLoading(true)
    setError(null)
    try {
      const result = await commands.importGroupsFromLms(
        activeProfile,
        roster,
        selectedAssignmentId,
        config,
      )
      if (result.status === "ok") {
        setRoster(result.data.roster)
        handleClose()
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setGroupSets([])
    setSelectedGroupSetId(null)
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Groups from LMS</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          {loading && !selectedGroupSetId && (
            <p className="text-sm text-muted-foreground">
              Loading group sets...
            </p>
          )}

          <div className="grid gap-2">
            <Label>LMS Group Set</Label>
            <Select
              value={selectedGroupSetId ?? undefined}
              onValueChange={setSelectedGroupSetId}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a group set" />
              </SelectTrigger>
              <SelectContent>
                {groupSets.map((gs) => (
                  <SelectItem key={gs.id} value={gs.id}>
                    {gs.name} ({gs.groups.length} groups)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedGroupSet && (
            <>
              <div className="grid gap-2">
                <Label>Filter Pattern (optional)</Label>
                <Input
                  placeholder="e.g., A1-* or Team-*"
                  value={filterPattern}
                  onChange={(e) => setFilterPattern(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use * as a wildcard. Leave empty to select manually.
                </p>
              </div>

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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedGroupSetId || loading}
          >
            {loading ? "Importing..." : "Import Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
