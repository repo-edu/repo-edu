/**
 * Dialog for copying (shallow clone) a group set.
 *
 * Creates a new local group set referencing the same groups.
 */

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Text,
} from "@repo-edu/ui"
import { useState } from "react"
import { selectGroupSetById, useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function CopyGroupSetDialog() {
  const sourceId = useUiStore((state) => state.copyGroupSetSourceId)
  const setSourceId = useUiStore((state) => state.setCopyGroupSetSourceId)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const open = sourceId !== null

  const groupSet = useProfileStore(selectGroupSetById(sourceId ?? ""))
  const copyGroupSet = useProfileStore((state) => state.copyGroupSet)

  const defaultName = groupSet ? `${groupSet.name} (copy)` : ""
  const [name, setName] = useState("")

  // Sync default name when dialog opens with a new source
  const [lastSourceId, setLastSourceId] = useState<string | null>(null)
  if (sourceId !== lastSourceId) {
    setLastSourceId(sourceId)
    if (sourceId && groupSet) {
      setName(`${groupSet.name} (copy)`)
    }
  }

  const isLmsOrSystem =
    groupSet?.connection?.kind === "canvas" ||
    groupSet?.connection?.kind === "moodle" ||
    groupSet?.connection?.kind === "system"

  const trimmedName = name.trim()
  const canCopy = trimmedName.length > 0

  const handleCopy = () => {
    if (!canCopy || !sourceId) return
    const newId = copyGroupSet(sourceId)
    if (newId) {
      // Rename the copy to the user-provided name
      useProfileStore.getState().renameGroupSet(newId, trimmedName)
      setSidebarSelection({ kind: "group-set", id: newId })
    }
    handleClose()
  }

  const handleClose = () => {
    setSourceId(null)
    setName("")
    setLastSourceId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Text className="text-sm">
            Create a local copy of <strong>{groupSet?.name}</strong>.
          </Text>

          <div className="rounded-md border px-3 py-2 space-y-1 text-xs text-muted-foreground">
            <p>This creates a new local group set that:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>References the same groups (no duplication)</li>
              {isLmsOrSystem && (
                <li>Shared groups continue to update on sync</li>
              )}
              <li>
                Groups with LMS/system origin remain read-only in the copy
              </li>
              <li>New groups you add to the copy will be editable</li>
            </ul>
          </div>

          <FormField label="Name" htmlFor="copy-gs-name">
            <Input
              id="copy-gs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCopy) handleCopy()
              }}
              autoFocus
            />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={!canCopy}>
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
