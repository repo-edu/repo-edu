import type { RosterMember } from "@repo-edu/domain"
import { generateGroupName, slugify } from "@repo-edu/domain"
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
import {
  selectGroupsForGroupSet,
  useProfileStore,
} from "../../stores/profile-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { StudentMultiSelect } from "./StudentMultiSelect.js"

const EMPTY_STUDENTS: RosterMember[] = []

export function AddGroupDialog() {
  const [name, setName] = useState("")
  const [normalizedPreview, setNormalizedPreview] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [userEditedName, setUserEditedName] = useState(false)
  const normalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const groupSetId = useUiStore((state) => state.addGroupDialogGroupSetId)
  const setGroupSetId = useUiStore((state) => state.setAddGroupDialogGroupSetId)
  const open = groupSetId !== null
  const roster = useProfileStore((state) => state.profile?.roster ?? null)
  const createGroup = useProfileStore((state) => state.createGroup)
  const students = useMemo(() => roster?.students ?? EMPTY_STUDENTS, [roster])
  const groups = useProfileStore(selectGroupsForGroupSet(groupSetId ?? ""))

  const groupsForSelect = useMemo(
    () =>
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        memberIds: g.memberIds,
      })),
    [groups],
  )

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  )

  useEffect(() => {
    if (userEditedName) return
    const members = selectedMembers
      .map((id) => studentMap.get(id))
      .filter((m): m is RosterMember => m !== undefined)
    setName(generateGroupName(members))
  }, [selectedMembers, studentMap, userEditedName])

  useEffect(() => {
    if (normalizeTimerRef.current) clearTimeout(normalizeTimerRef.current)
    const trimmed = name.trim()
    if (!trimmed) {
      setNormalizedPreview("")
      return
    }
    normalizeTimerRef.current = setTimeout(() => {
      setNormalizedPreview(slugify(trimmed))
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

  const handleMembersChange = useCallback((members: string[]) => {
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
      <DialogContent className="max-w-md">
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
