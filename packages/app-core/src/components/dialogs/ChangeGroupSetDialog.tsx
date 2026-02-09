/**
 * Dialog for changing an assignment's group set.
 *
 * Warns about exclusion clearing when switching group sets.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle } from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { selectGroupSets, useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { unwrapGroupSetConnection } from "../../utils/groupSetConnection"

export function ChangeGroupSetDialog() {
  const assignmentId = useUiStore((state) => state.changeGroupSetAssignmentId)
  const setAssignmentId = useUiStore(
    (state) => state.setChangeGroupSetAssignmentId,
  )
  const open = assignmentId !== null

  const assignment = useProfileStore(
    (state) =>
      state.document?.roster?.assignments.find((a) => a.id === assignmentId) ??
      null,
  )
  const groupSets = useProfileStore(selectGroupSets)
  const updateAssignment = useProfileStore((state) => state.updateAssignment)

  const [selectedGroupSetId, setSelectedGroupSetId] = useState<string | null>(
    null,
  )

  // Sync initial selection when dialog opens
  const [lastAssignmentId, setLastAssignmentId] = useState<string | null>(null)
  if (assignmentId !== lastAssignmentId) {
    setLastAssignmentId(assignmentId)
    setSelectedGroupSetId(assignment?.group_set_id ?? null)
  }

  const sortedGroupSets = useMemo(() => {
    return [...groupSets].sort((a, b) => {
      const aSystem =
        unwrapGroupSetConnection(a.connection)?.kind === "system" ? 0 : 1
      const bSystem =
        unwrapGroupSetConnection(b.connection)?.kind === "system" ? 0 : 1
      if (aSystem !== bSystem) return aSystem - bSystem
      return a.name.localeCompare(b.name)
    })
  }, [groupSets])

  const currentGroupSet = useMemo(
    () => groupSets.find((gs) => gs.id === assignment?.group_set_id) ?? null,
    [groupSets, assignment],
  )

  const isChanging =
    selectedGroupSetId !== null &&
    selectedGroupSetId !== assignment?.group_set_id
  const hasExclusions =
    (assignment?.group_selection.excluded_group_ids.length ?? 0) > 0
  const willClearExclusions = isChanging && hasExclusions

  const canConfirm = selectedGroupSetId !== null && isChanging

  const handleConfirm = () => {
    if (!canConfirm || !assignmentId || !selectedGroupSetId) return
    updateAssignment(
      assignmentId,
      { group_set_id: selectedGroupSetId },
      { clearExclusionsOnGroupSetChange: true },
    )
    handleClose()
  }

  const handleClose = () => {
    setAssignmentId(null)
    setSelectedGroupSetId(null)
    setLastAssignmentId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {currentGroupSet && (
            <div className="text-sm">
              <Text className="text-muted-foreground">Current group set:</Text>
              <Text className="font-medium">{currentGroupSet.name}</Text>
            </div>
          )}

          <FormField label="New Group Set" htmlFor="change-gs-select">
            <Select
              value={selectedGroupSetId ?? undefined}
              onValueChange={setSelectedGroupSetId}
            >
              <SelectTrigger id="change-gs-select">
                <SelectValue placeholder="Select a group set" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {sortedGroupSets.map((gs) => (
                  <SelectItem key={gs.id} value={gs.id}>
                    {gs.name}
                    {unwrapGroupSetConnection(gs.connection)?.kind === "system"
                      ? " (System)"
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {willClearExclusions && (
            <div className="rounded-md border border-amber-500/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5" />
                {assignment?.group_selection.excluded_group_ids.length} excluded
                group{" "}
                {assignment?.group_selection.excluded_group_ids.length !== 1
                  ? "s"
                  : ""}{" "}
                will be cleared (exclusions don't transfer across group sets).
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
