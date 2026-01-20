/**
 * Dialog for creating a new assignment.
 */

import type {
  Assignment,
  AssignmentType,
  CachedLmsGroup,
  LmsGroupSetCacheEntry,
} from "@repo-edu/backend-interface/types"
import {
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
import { useEffect, useMemo, useState } from "react"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { formatAssignmentType } from "../../utils/labels"
import { generateAssignmentId, generateGroupId } from "../../utils/nanoid"

type GroupSourceMode = "manual" | "link" | "copy"

const buildAssignmentGroups = (groups: CachedLmsGroup[]) =>
  groups.map((group) => ({
    id: generateGroupId(),
    name: group.name,
    member_ids: [...group.resolved_member_ids],
  }))

const filterGroupsByPattern = (groups: CachedLmsGroup[], pattern: string) => {
  if (!pattern.trim()) return groups
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
  const regex = new RegExp(`^${escaped}$`, "i")
  return groups.filter((group) => regex.test(group.name))
}

export function NewAssignmentDialog() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [assignmentType, setAssignmentType] =
    useState<AssignmentType>("class_wide")
  const [groupMode, setGroupMode] = useState<GroupSourceMode>("manual")
  const [selectedGroupSetId, setSelectedGroupSetId] = useState<string | null>(
    null,
  )
  const [filterPattern, setFilterPattern] = useState("")
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set(),
  )
  const [error, setError] = useState<string | null>(null)

  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const addAssignment = useProfileStore((state) => state.addAssignment)
  const setAssignmentSelection = useProfileStore(
    (state) => state.setAssignmentSelection,
  )
  const open = useUiStore((state) => state.newAssignmentDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAssignmentDialogOpen)

  const cachedGroupSets = useMemo(() => roster?.lms_group_sets ?? [], [roster])
  const selectableGroupSets = useMemo(() => {
    if (groupMode === "link") {
      return cachedGroupSets.filter((set) => set.kind === "linked")
    }
    return cachedGroupSets.filter((set) => set.kind !== "unlinked")
  }, [cachedGroupSets, groupMode])

  const selectedGroupSet: LmsGroupSetCacheEntry | null =
    selectedGroupSetId &&
    selectableGroupSets.some((set) => set.id === selectedGroupSetId)
      ? (selectableGroupSets.find((set) => set.id === selectedGroupSetId) ??
        null)
      : null

  const filteredGroups = useMemo(() => {
    if (!selectedGroupSet) return []
    return filterGroupsByPattern(selectedGroupSet.groups, filterPattern)
  }, [filterPattern, selectedGroupSet])

  useEffect(() => {
    if (groupMode === "manual") {
      if (selectedGroupSetId !== null) {
        setSelectedGroupSetId(null)
      }
      return
    }

    if (selectableGroupSets.length === 0) {
      if (selectedGroupSetId !== null) {
        setSelectedGroupSetId(null)
      }
      return
    }

    if (
      !selectedGroupSetId ||
      !selectableGroupSets.some((set) => set.id === selectedGroupSetId)
    ) {
      setSelectedGroupSetId(selectableGroupSets[0].id)
    }
  }, [groupMode, selectableGroupSets, selectedGroupSetId])

  useEffect(() => {
    setSelectedGroupIds(new Set())
    setFilterPattern("")
    setError(null)
  }, [selectedGroupSetId, groupMode])

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
    const ids = filteredGroups.map((group) => group.id)
    setSelectedGroupIds(new Set(ids))
  }

  const deselectAll = () => {
    setSelectedGroupIds(new Set())
  }

  const resolveCopyGroups = (groups: CachedLmsGroup[]) => {
    if (selectedGroupIds.size > 0) {
      return groups.filter((group) => selectedGroupIds.has(group.id))
    }
    if (filterPattern.trim()) {
      return filteredGroups
    }
    return groups
  }

  const handleCreate = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    if (!roster) {
      setError("No roster loaded")
      return
    }

    let groups: ReturnType<typeof buildAssignmentGroups> = []
    let groupSetId: string | null = null

    if (groupMode === "link") {
      if (!selectedGroupSet) {
        setError("Select a linked group set")
        return
      }
      groups = buildAssignmentGroups(selectedGroupSet.groups)
      groupSetId = selectedGroupSet.id
    }

    if (groupMode === "copy") {
      if (!selectedGroupSet) {
        setError("Select a group set")
        return
      }
      const groupsToCopy = resolveCopyGroups(selectedGroupSet.groups)
      groups = buildAssignmentGroups(groupsToCopy)
      groupSetId = null
    }

    const assignment: Assignment = {
      id: generateAssignmentId(),
      name: trimmedName,
      description: description.trim() || null,
      assignment_type: assignmentType,
      groups,
      group_set_id: groupSetId,
    }

    addAssignment(assignment, { select: true })
    setAssignmentSelection({ mode: "assignment", id: assignment.id })
    setOpen(false)
    resetDialogState()
  }

  const resetDialogState = () => {
    setName("")
    setDescription("")
    setAssignmentType("class_wide")
    setGroupMode("manual")
    setSelectedGroupSetId(null)
    setFilterPattern("")
    setSelectedGroupIds(new Set())
    setError(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      resetDialogState()
    }
  }

  const selectedCount =
    selectedGroupIds.size > 0 ? selectedGroupIds.size : filteredGroups.length
  const studentCount =
    selectedGroupIds.size > 0
      ? filteredGroups
          .filter((group) => selectedGroupIds.has(group.id))
          .reduce((acc, group) => acc + group.resolved_member_ids.length, 0)
      : filteredGroups.reduce(
          (acc, group) => acc + group.resolved_member_ids.length,
          0,
        )

  const hasName = name.trim().length > 0
  const canCreate = hasName && (groupMode === "manual" || !!selectedGroupSet)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Assignment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && <Text className="text-sm text-destructive">{error}</Text>}
          <FormField
            label="Name"
            htmlFor="assignment-name"
            title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
          >
            <Input
              id="assignment-name"
              placeholder="e.g., lab-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  handleCreate()
                }
              }}
              title="A short identifier used for repository naming (e.g., 'lab-1', 'project-2'). This should match the name of the template repository in your template org."
            />
          </FormField>
          <FormField
            label="Description (optional)"
            htmlFor="assignment-description"
            title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
          >
            <Input
              id="assignment-description"
              placeholder="e.g., Lab 1: Python Basics"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              title="Optional human-readable name shown in the UI (e.g., 'Lab 1: Python Basics'). If empty, the name is displayed."
            />
          </FormField>
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Type (cannot be changed after creation)
            </Label>
            <RadioGroup
              value={assignmentType}
              onValueChange={(value) =>
                setAssignmentType(value as AssignmentType)
              }
              className="flex flex-col gap-2"
            >
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="class_wide" id="assignment-type-class" />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="assignment-type-class"
                    className="font-medium"
                  >
                    {formatAssignmentType("class_wide")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    All active students must be assigned to a group.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="selective" id="assignment-type-select" />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="assignment-type-select"
                    className="font-medium"
                  >
                    {formatAssignmentType("selective")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Any subset of active students can participate.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Group source</Label>
            <RadioGroup
              value={groupMode}
              onValueChange={(value) => setGroupMode(value as GroupSourceMode)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="manual" id="group-mode-manual" />
                <div className="space-y-0.5">
                  <Label htmlFor="group-mode-manual" className="font-medium">
                    Manual groups
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Start with empty groups and add members yourself.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="link" id="group-mode-link" />
                <div className="space-y-0.5">
                  <Label htmlFor="group-mode-link" className="font-medium">
                    Link group set (read-only)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Keep groups synced with cached LMS data.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <RadioGroupItem value="copy" id="group-mode-copy" />
                <div className="space-y-0.5">
                  <Label htmlFor="group-mode-copy" className="font-medium">
                    Copy group set (editable)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Import a snapshot you can edit without syncing.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {groupMode !== "manual" && (
            <FormField label="Group Set">
              <Select
                value={selectedGroupSetId ?? undefined}
                onValueChange={setSelectedGroupSetId}
                disabled={selectableGroupSets.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a group set" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {selectableGroupSets.map((groupSet) => (
                    <SelectItem key={groupSet.id} value={groupSet.id}>
                      {groupSet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectableGroupSets.length === 0 && (
                <Text className="text-xs text-muted-foreground mt-2">
                  No cached group sets. Import one in the Group tab first.
                </Text>
              )}
            </FormField>
          )}

          {groupMode === "copy" && selectedGroupSet && (
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
                  {filteredGroups.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3 text-center">
                      No groups match the filter
                    </p>
                  )}
                  {filteredGroups.map((group) => (
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
                        {group.resolved_member_ids.length} student
                        {group.resolved_member_ids.length !== 1 ? "s" : ""}
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
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
