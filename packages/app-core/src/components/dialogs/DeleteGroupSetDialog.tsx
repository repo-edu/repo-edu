/**
 * Confirmation dialog for deleting a group set.
 *
 * Lists assignments that will be cascade-deleted and notes about orphaned groups.
 */

import type {
  Assignment,
  Group,
  GroupSet,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useMemo } from "react"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

const EMPTY_ASSIGNMENTS: Assignment[] = []
const EMPTY_GROUPS: Group[] = []
const EMPTY_GROUP_SETS: GroupSet[] = []

export function DeleteGroupSetDialog() {
  const targetId = useUiStore((state) => state.deleteGroupSetTargetId)
  const setTargetId = useUiStore((state) => state.setDeleteGroupSetTargetId)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const open = targetId !== null

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const deleteGroupSet = useProfileStore((state) => state.deleteGroupSet)
  const deleteAssignment = useProfileStore((state) => state.deleteAssignment)

  const allGroupSets = roster?.group_sets ?? EMPTY_GROUP_SETS
  const groupSet = useMemo(() => {
    if (!roster || !targetId) return null
    return roster.group_sets.find((entry) => entry.id === targetId) ?? null
  }, [roster, targetId])

  const assignments = useMemo(() => {
    if (!roster || !targetId) return EMPTY_ASSIGNMENTS
    return roster.assignments.filter((entry) => entry.group_set_id === targetId)
  }, [roster, targetId])

  const groups = useMemo(() => {
    if (!roster || !targetId) return EMPTY_GROUPS
    const groupSetEntry = roster.group_sets.find(
      (entry) => entry.id === targetId,
    )
    if (!groupSetEntry) return EMPTY_GROUPS
    const groupMap = new Map(roster.groups.map((group) => [group.id, group]))
    return groupSetEntry.group_ids
      .map((groupId) => groupMap.get(groupId))
      .filter((group): group is Group => Boolean(group))
  }, [roster, targetId])

  // Count orphaned groups (only referenced by this set)
  const orphanedCount = useMemo(() => {
    if (!targetId) return 0
    let count = 0
    for (const group of groups) {
      const refCount = allGroupSets.filter((gs) =>
        gs.group_ids.includes(group.id),
      ).length
      if (refCount <= 1) count++
    }
    return count
  }, [groups, allGroupSets, targetId])

  const survivingCount = groups.length - orphanedCount

  const handleDelete = () => {
    if (!targetId) return
    // Cascade: delete assignments referencing this set
    for (const a of assignments) {
      deleteAssignment(a.id)
    }
    deleteGroupSet(targetId)
    setSidebarSelection(null)
    handleClose()
  }

  const handleClose = () => {
    setTargetId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Text className="text-sm">
            Delete <strong>{groupSet?.name}</strong>?
          </Text>

          {assignments.length > 0 && (
            <div className="rounded-md border border-destructive/50 px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-destructive font-medium">
                <AlertTriangle className="size-3.5" />
                {assignments.length} assignment
                {assignments.length !== 1 ? "s" : ""} will be deleted
              </div>
              <ul className="text-xs text-muted-foreground list-disc ml-5">
                {assignments.map((a) => (
                  <li key={a.id}>{a.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            {orphanedCount > 0 && (
              <p>
                {orphanedCount} group{orphanedCount !== 1 ? "s" : ""} only
                referenced by this set will be deleted.
              </p>
            )}
            {survivingCount > 0 && (
              <p>
                {survivingCount} group{survivingCount !== 1 ? "s" : ""}{" "}
                referenced by other sets will be preserved.
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
