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
import { useEffect, useMemo, useState } from "react"
import { useProfileStore } from "../../stores/profile-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { generateAssignmentId } from "../../utils/nanoid.js"

export function NewAssignmentDialog() {
  const [name, setName] = useState("")

  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)
  const preSelectedGroupSetId = useUiStore(
    (state) => state.preSelectedGroupSetId,
  )
  const setPreSelectedGroupSetId = useUiStore(
    (state) => state.setPreSelectedGroupSetId,
  )
  const selection = useUiStore((state) => state.sidebarSelection)

  const addAssignment = useProfileStore((state) => state.addAssignment)
  const roster = useProfileStore((state) => state.profile?.roster ?? null)

  const resolvedGroupSetId =
    preSelectedGroupSetId ??
    (selection?.kind === "group-set" ? selection.id : null)

  const duplicateName = useMemo(() => {
    const trimmed = name.trim().toLowerCase()
    if (!trimmed || !roster || !resolvedGroupSetId) return false
    return roster.assignments.some(
      (assignment) =>
        assignment.groupSetId === resolvedGroupSetId &&
        assignment.name.trim().toLowerCase() === trimmed,
    )
  }, [name, roster, resolvedGroupSetId])

  useEffect(() => {
    if (!open) {
      setName("")
      return
    }

    if (!preSelectedGroupSetId && selection?.kind === "group-set") {
      setPreSelectedGroupSetId(selection.id)
    }
  }, [open, preSelectedGroupSetId, selection, setPreSelectedGroupSetId])

  const canCreate =
    name.trim().length > 0 && resolvedGroupSetId !== null && !duplicateName

  const handleClose = () => {
    setOpen(false)
    setName("")
    setPreSelectedGroupSetId(null)
  }

  const handleCreate = () => {
    if (!canCreate || !resolvedGroupSetId) return

    addAssignment({
      id: generateAssignmentId(),
      name: name.trim(),
      groupSetId: resolvedGroupSetId,
    })
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <FormField
            label="Name"
            htmlFor="assignment-name"
            title="A short identifier used for repository naming."
          >
            <Input
              id="assignment-name"
              placeholder="e.g., lab-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  handleCreate()
                }
              }}
              autoFocus
            />
          </FormField>
          {resolvedGroupSetId === null && (
            <Text className="text-sm text-muted-foreground">
              Select a group set before creating an assignment.
            </Text>
          )}
          {duplicateName && (
            <Text className="text-sm text-destructive">
              An assignment with this name already exists in the selected group
              set.
            </Text>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
