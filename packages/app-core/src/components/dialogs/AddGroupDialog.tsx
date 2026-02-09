/**
 * Dialog for adding a new group to a group set.
 *
 * Features:
 * - Member picker (students only, no staff)
 * - Auto-generated name from selected members (via generateGroupName)
 * - Normalized preview (debounced call to backend normalizeGroupName)
 * - Auto-update stops once user manually edits name
 */

import type {
  Group,
  RosterMember,
  RosterMemberId,
} from "@repo-edu/backend-interface/types"
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../bindings/commands"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { generateGroupName } from "../../utils/groupNaming"
import { StudentMultiSelect } from "./StudentMultiSelect"

const EMPTY_STUDENTS: RosterMember[] = []
const EMPTY_GROUPS: Group[] = []

export function AddGroupDialog() {
  const [name, setName] = useState("")
  const [normalizedPreview, setNormalizedPreview] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<RosterMemberId[]>([])
  const [userEditedName, setUserEditedName] = useState(false)
  const normalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const groupSetId = useUiStore((state) => state.addGroupDialogGroupSetId)
  const setGroupSetId = useUiStore((state) => state.setAddGroupDialogGroupSetId)
  const open = groupSetId !== null
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const createGroup = useProfileStore((state) => state.createGroup)
  const students = useMemo(() => roster?.students ?? EMPTY_STUDENTS, [roster])
  const groups = useMemo(() => {
    if (!roster || !groupSetId) return EMPTY_GROUPS
    const groupSet = roster.group_sets.find((entry) => entry.id === groupSetId)
    if (!groupSet) return EMPTY_GROUPS
    const groupMap = new Map(roster.groups.map((group) => [group.id, group]))
    return groupSet.group_ids
      .map((groupId) => groupMap.get(groupId))
      .filter((group): group is Group => Boolean(group))
  }, [roster, groupSetId])

  // Build groups data for StudentMultiSelect's multi-group indicator
  const groupsForSelect = useMemo(
    () =>
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        member_ids: g.member_ids,
      })),
    [groups],
  )

  // Resolve selected members to RosterMember objects for name generation
  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  )

  // Auto-generate name from selected members (unless user has manually edited)
  useEffect(() => {
    if (userEditedName) return
    const members = selectedMembers
      .map((id) => studentMap.get(id))
      .filter((m) => m !== undefined)
    setName(generateGroupName(members))
  }, [selectedMembers, studentMap, userEditedName])

  // Debounced normalize preview
  useEffect(() => {
    if (normalizeTimerRef.current) clearTimeout(normalizeTimerRef.current)
    const trimmed = name.trim()
    if (!trimmed) {
      setNormalizedPreview("")
      return
    }
    normalizeTimerRef.current = setTimeout(async () => {
      const result = await commands.normalizeGroupName(trimmed)
      if (result.status === "ok") {
        setNormalizedPreview(result.data)
      }
    }, 300)
    return () => {
      if (normalizeTimerRef.current) clearTimeout(normalizeTimerRef.current)
    }
  }, [name])

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value)
      if (!userEditedName) setUserEditedName(true)
    },
    [userEditedName],
  )

  const handleMembersChange = useCallback((members: RosterMemberId[]) => {
    setSelectedMembers(members)
  }, [])

  const trimmedName = name.trim()
  const canCreate = trimmedName.length > 0

  const handleCreate = () => {
    if (!canCreate || !groupSetId) return
    createGroup(groupSetId, trimmedName, selectedMembers)
    handleClose()
  }

  const handleClose = () => {
    setGroupSetId(null)
    setName("")
    setNormalizedPreview("")
    setSelectedMembers([])
    setUserEditedName(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Group</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="Group Name" htmlFor="group-name">
            <Input
              id="group-name"
              placeholder="e.g., Team-01"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate()
              }}
            />
            {normalizedPreview && normalizedPreview !== trimmedName && (
              <Text className="text-xs text-muted-foreground mt-1">
                Normalized: {normalizedPreview}
              </Text>
            )}
          </FormField>

          <FormField label="Members (optional)">
            <StudentMultiSelect
              students={students}
              selected={selectedMembers}
              onChange={handleMembersChange}
              groups={groupsForSelect}
            />
          </FormField>
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
