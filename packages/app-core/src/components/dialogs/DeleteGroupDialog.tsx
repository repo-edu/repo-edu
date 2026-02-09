/**
 * Confirmation dialog for deleting a group.
 *
 * Shows group name and reference count across group sets.
 * Warns if the group is shared by multiple sets.
 */

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
import {
  selectGroupById,
  selectGroupReferenceCount,
  useProfileStore,
} from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function DeleteGroupDialog() {
  const targetId = useUiStore((state) => state.deleteGroupTargetId)
  const setTargetId = useUiStore((state) => state.setDeleteGroupTargetId)
  const open = targetId !== null

  const group = useProfileStore(selectGroupById(targetId ?? ""))
  const refCount = useProfileStore(selectGroupReferenceCount(targetId ?? ""))
  const deleteGroup = useProfileStore((state) => state.deleteGroup)

  const isShared = refCount > 1

  const handleDelete = () => {
    if (!targetId) return
    deleteGroup(targetId)
    handleClose()
  }

  const handleClose = () => {
    setTargetId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Group</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Text className="text-sm">
            Delete group <strong>{group?.name ?? targetId}</strong>?
          </Text>

          {isShared && (
            <div className="rounded-md border border-destructive/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="size-3.5" />
                This group is shared by {refCount} group sets. Deleting it will
                remove the group from all sets.
              </div>
            </div>
          )}

          {group && group.member_ids.length > 0 && (
            <Text className="text-xs text-muted-foreground">
              {group.member_ids.length} member
              {group.member_ids.length !== 1 ? "s" : ""} will lose this group
              membership.
            </Text>
          )}
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
