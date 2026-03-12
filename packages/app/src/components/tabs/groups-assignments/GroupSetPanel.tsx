import type {
  Assignment,
  Group,
  GroupSetConnection,
  RosterMember,
} from "@repo-edu/domain"
import {
  Button,
  EmptyState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@repo-edu/ui"
import { Loader2, Plus, Search, Trash2 } from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import {
  selectAssignmentsForGroupSet,
  selectEditableGroupTargets,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { GroupItem } from "./GroupItem.js"

type GroupSetPanelProps = {
  groupSetId: string
}

function getConnectionKind(
  connection: GroupSetConnection | null,
): "local" | "system" | "canvas" | "moodle" | "import" {
  if (!connection) return "local"
  return connection.kind
}

export function GroupSetPanel({ groupSetId }: GroupSetPanelProps) {
  const groupSet = useCourseStore(selectGroupSetById(groupSetId))
  const groups = useCourseStore(selectGroupsForGroupSet(groupSetId))
  const assignments = useCourseStore(selectAssignmentsForGroupSet(groupSetId))
  const editableTargets = useCourseStore(selectEditableGroupTargets)
  const updateAssignment = useCourseStore((s) => s.updateAssignment)
  const deleteAssignment = useCourseStore((s) => s.deleteAssignment)
  const roster = useCourseStore((s) => s.course?.roster ?? null)
  const groupSetOperation = useUiStore((s) => s.groupSetOperation)
  const panelTab = useUiStore((s) => s.groupSetPanelTab)
  const setPanelTab = useUiStore((s) => s.setGroupSetPanelTab)
  const setNewAssignmentDialogOpen = useUiStore(
    (s) => s.setNewAssignmentDialogOpen,
  )
  const setPreSelectedGroupSetId = useUiStore((s) => s.setPreSelectedGroupSetId)
  const setAddGroupDialogGroupSetId = useUiStore(
    (s) => s.setAddGroupDialogGroupSetId,
  )
  const setDeleteGroupTargetId = useUiStore((s) => s.setDeleteGroupTargetId)

  // Build a memberGroupIndex for MemberChip dedup (active members only).
  const memberGroupIndex = useMemo(() => {
    const index = new Map<string, Set<string>>()
    if (!roster) return index
    const activeIds = new Set(
      [...roster.students, ...roster.staff]
        .filter((m) => m.status === "active")
        .map((m) => m.id),
    )
    for (const group of roster.groups) {
      for (const memberId of group.memberIds) {
        if (!activeIds.has(memberId)) continue
        let s = index.get(memberId)
        if (!s) {
          s = new Set()
          index.set(memberId, s)
        }
        s.add(group.id)
      }
    }
    return index
  }, [roster])

  // Resolve members for each group.
  const allMembers = useMemo(
    () => (roster ? [...roster.students, ...roster.staff] : []),
    [roster],
  )
  const memberById = useMemo(() => {
    const map = new Map<string, RosterMember>()
    for (const m of allMembers) map.set(m.id, m)
    return map
  }, [allMembers])
  const staffIds = useMemo(
    () => new Set((roster?.staff ?? []).map((s) => s.id)),
    [roster],
  )

  if (!groupSet) {
    return (
      <EmptyState message="Group set not found">
        <Text className="text-muted-foreground text-center">
          The selected group set no longer exists.
        </Text>
      </EmptyState>
    )
  }

  const connection = groupSet.connection
  const kind = getConnectionKind(connection)
  const isOperationActive = groupSetOperation !== null
  const isThisGroupSetBusy =
    !!groupSetOperation &&
    "groupSetId" in groupSetOperation &&
    groupSetOperation.groupSetId === groupSetId
  const isReadOnly = kind === "system" || kind === "canvas" || kind === "moodle"
  const isSetEditable = !isReadOnly

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <h3 className="text-sm font-semibold truncate">{groupSet.name}</h3>
        {isThisGroupSetBusy && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Tabs: Groups and Assignments */}
      <Tabs
        value={panelTab}
        onValueChange={(v) => setPanelTab(v as "groups" | "assignments")}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="px-4 pt-2">
          <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
          <TabsTrigger value="assignments">
            Assignments ({assignments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="flex-1 overflow-auto px-4 py-2">
          <GroupsTab
            groups={groups}
            groupSetId={groupSetId}
            memberById={memberById}
            staffIds={staffIds}
            isSetEditable={isSetEditable}
            editableTargets={editableTargets}
            memberGroupIndex={memberGroupIndex}
            disabled={isOperationActive}
            onAddGroup={() => setAddGroupDialogGroupSetId(groupSetId)}
            onDeleteGroup={(groupId) => setDeleteGroupTargetId(groupId)}
          />
        </TabsContent>

        <TabsContent
          value="assignments"
          className="flex-1 overflow-auto px-4 py-2"
        >
          <AssignmentsTab
            assignments={assignments}
            updateAssignment={updateAssignment}
            deleteAssignment={deleteAssignment}
            onAddAssignment={() => {
              setPreSelectedGroupSetId(groupSetId)
              setNewAssignmentDialogOpen(true)
            }}
            disabled={isOperationActive}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Groups sub-tab
// ---------------------------------------------------------------------------

function GroupsTab({
  groups,
  groupSetId,
  memberById,
  staffIds,
  isSetEditable,
  editableTargets,
  memberGroupIndex,
  disabled,
  onAddGroup,
  onDeleteGroup,
}: {
  groups: Group[]
  groupSetId: string
  memberById: Map<string, RosterMember>
  staffIds: Set<string>
  isSetEditable: boolean
  editableTargets: ReturnType<typeof selectEditableGroupTargets>
  memberGroupIndex: Map<string, Set<string>>
  disabled: boolean
  onAddGroup: () => void
  onDeleteGroup: (groupId: string) => void
}) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!query) return groups
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(query)) return true
      return g.memberIds.some((id) => {
        const m = memberById.get(id)
        if (!m) return false
        return (
          m.name.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query)
        )
      })
    })
  }, [groups, query, memberById])

  if (groups.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-3">No groups in this set.</p>
        {isSetEditable && (
          <Button size="sm" variant="outline" onClick={onAddGroup}>
            <Plus className="size-4 mr-1" />
            Add Group
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 size-4" />
          <Input
            placeholder="Search members and groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {isSetEditable && (
          <Button
            size="sm"
            variant="outline"
            onClick={onAddGroup}
            disabled={disabled}
          >
            <Plus className="size-4 mr-1" />
            Add Group
          </Button>
        )}
      </div>

      <div className="divide-y">
        {filteredGroups.map((group) => {
          const members = group.memberIds
            .map((id) => memberById.get(id))
            .filter(
              (m): m is RosterMember =>
                m !== undefined && m.status === "active",
            )
          return (
            <GroupItem
              key={group.id}
              group={group}
              groupSetId={groupSetId}
              members={members}
              staffIds={staffIds}
              isSetEditable={isSetEditable}
              disabled={disabled}
              editableTargets={editableTargets}
              memberGroupIndex={memberGroupIndex}
              onDeleteGroup={() => onDeleteGroup(group.id)}
            />
          )
        })}
      </div>

      {filteredGroups.length === 0 && query && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No members or groups match &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Assignments sub-tab
// ---------------------------------------------------------------------------

function AssignmentsTab({
  assignments,
  updateAssignment,
  deleteAssignment,
  onAddAssignment,
  disabled,
}: {
  assignments: Assignment[]
  updateAssignment: (id: string, updates: Partial<Assignment>) => void
  deleteAssignment: (id: string) => void
  onAddAssignment: () => void
  disabled: boolean
}) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-3">
          No assignments for this group set.
        </p>
        <Button size="sm" variant="outline" onClick={onAddAssignment}>
          <Plus className="size-4 mr-1" />
          Add Assignment
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onAddAssignment}
          disabled={disabled}
        >
          <Plus className="size-4 mr-1" />
          Add Assignment
        </Button>
      </div>
      <div className="divide-y">
        {assignments.map((assignment) => (
          <AssignmentRow
            key={assignment.id}
            assignment={assignment}
            onUpdate={(updates) => updateAssignment(assignment.id, updates)}
            onDelete={() => deleteAssignment(assignment.id)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}

function AssignmentRow({
  assignment,
  onUpdate,
  onDelete,
  disabled,
}: {
  assignment: Assignment
  onUpdate: (updates: Partial<Assignment>) => void
  onDelete: () => void
  disabled: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(assignment.name)

  const handleSave = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== assignment.name) {
      onUpdate({ name: trimmed })
    }
    setIsEditing(false)
    setEditName(assignment.name)
  }

  return (
    <div className="flex items-center gap-2 py-2">
      {isEditing ? (
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
            if (e.key === "Escape") {
              setIsEditing(false)
              setEditName(assignment.name)
            }
          }}
          autoFocus
          className="h-7 flex-1"
        />
      ) : (
        <button
          type="button"
          className="text-sm font-medium hover:underline text-left flex-1 truncate"
          onClick={() => {
            if (!disabled) {
              setEditName(assignment.name)
              setIsEditing(true)
            }
          }}
          disabled={disabled}
        >
          {assignment.name}
        </button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
        onClick={onDelete}
        disabled={disabled}
        title="Delete assignment"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
