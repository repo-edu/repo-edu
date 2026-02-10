/**
 * Dialog for creating a new assignment.
 *
 * In the new model, assignments reference a group_set_id and have
 * a group_selection (all / pattern). No owned groups.
 */

import type { GroupSelectionMode } from "@repo-edu/backend-interface/types"
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
import { useEffect, useMemo, useState } from "react"
import {
  selectGroupSets,
  selectSystemGroupSet,
  useProfileStore,
} from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

type SelectionKind = "all" | "pattern"

export function NewAssignmentDialog() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [groupSetId, setGroupSetId] = useState<string | null>(null)
  const [selectionKind, setSelectionKind] = useState<SelectionKind>("all")
  const [pattern, setPattern] = useState("")

  const groupSets = useProfileStore(selectGroupSets)
  const individualStudentsSet = useProfileStore(
    selectSystemGroupSet("individual_students"),
  )
  const createAssignment = useProfileStore((state) => state.createAssignment)
  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)
  const preSelectedGroupSetId = useUiStore(
    (state) => state.preSelectedGroupSetId,
  )
  const setPreSelectedGroupSetId = useUiStore(
    (state) => state.setPreSelectedGroupSetId,
  )
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)

  // Sort group sets: system first, then alphabetical
  const sortedGroupSets = useMemo(() => {
    return [...groupSets].sort((a, b) => {
      const aSystem = a.connection?.kind === "system" ? 0 : 1
      const bSystem = b.connection?.kind === "system" ? 0 : 1
      if (aSystem !== bSystem) return aSystem - bSystem
      return a.name.localeCompare(b.name)
    })
  }, [groupSets])

  // Handle pre-selection and default on open
  useEffect(() => {
    if (!open) return

    if (preSelectedGroupSetId) {
      const exists = groupSets.some((gs) => gs.id === preSelectedGroupSetId)
      if (exists) {
        setGroupSetId(preSelectedGroupSetId)
      }
      setPreSelectedGroupSetId(null)
    } else if (!groupSetId) {
      // Default to Individual Students if available
      setGroupSetId(individualStudentsSet?.id ?? groupSets[0]?.id ?? null)
    }
  }, [
    open,
    preSelectedGroupSetId,
    groupSets,
    individualStudentsSet,
    groupSetId,
    setPreSelectedGroupSetId,
  ])

  const trimmedName = name.trim()
  const canCreate = trimmedName.length > 0 && groupSetId !== null

  const handleCreate = () => {
    if (!canCreate || !groupSetId) return

    const groupSelection: GroupSelectionMode =
      selectionKind === "pattern"
        ? { kind: "pattern", pattern: pattern || "*", excluded_group_ids: [] }
        : { kind: "all", excluded_group_ids: [] }

    const id = createAssignment(
      {
        name: trimmedName,
        description: description.trim() || null,
        group_set_id: groupSetId,
        group_selection: groupSelection,
      },
      { select: true },
    )

    setSidebarSelection({ kind: "assignment", id })
    handleClose()
  }

  const handleClose = () => {
    setOpen(false)
    setName("")
    setDescription("")
    setGroupSetId(null)
    setSelectionKind("all")
    setPattern("")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField
            label="Name"
            htmlFor="assignment-name"
            title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2')"
          >
            <Input
              id="assignment-name"
              placeholder="e.g., lab-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate()
              }}
              autoFocus
            />
          </FormField>

          <FormField
            label="Description (optional)"
            htmlFor="assignment-description"
            title="Optional human-readable name shown in the UI"
          >
            <Input
              id="assignment-description"
              placeholder="e.g., Lab 1: Python Basics"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <FormField label="Group Set" htmlFor="assignment-group-set">
            {sortedGroupSets.length === 0 ? (
              <Text className="text-xs text-muted-foreground">
                No group sets available. Create a group set first.
              </Text>
            ) : (
              <Select
                value={groupSetId ?? undefined}
                onValueChange={setGroupSetId}
              >
                <SelectTrigger id="assignment-group-set">
                  <SelectValue placeholder="Select a group set" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {sortedGroupSets.map((gs) => (
                    <SelectItem key={gs.id} value={gs.id}>
                      {gs.name}
                      {gs.connection?.kind === "system" ? " (System)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Group selection</Label>
            <RadioGroup
              value={selectionKind}
              onValueChange={(v) => setSelectionKind(v as SelectionKind)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="new-assign-sel-all" />
                <Label htmlFor="new-assign-sel-all" className="text-sm">
                  All groups
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pattern" id="new-assign-sel-pattern" />
                <Label htmlFor="new-assign-sel-pattern" className="text-sm">
                  Pattern filter
                </Label>
              </div>
            </RadioGroup>

            {selectionKind === "pattern" && (
              <div className="pl-6 space-y-1.5">
                <Input
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="e.g., 1D* or Team-*"
                  className="h-7 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Glob pattern matched against group names. Use * for wildcard.
                </p>
              </div>
            )}
          </div>
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
