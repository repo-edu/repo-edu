import type {
  Assignment,
  Group,
  GroupSetConnection,
  RosterMember,
} from "@repo-edu/domain"
import {
  computeMembersSurnamesSlug,
  computeRepoName,
  defaultRepoTemplate,
} from "@repo-edu/domain"
import { Button, EmptyState, Input, Text } from "@repo-edu/ui"
import { Plus, Search } from "@repo-edu/ui/components/icons"
import { useCallback, useMemo, useState } from "react"
import {
  selectAssignmentsForGroupSet,
  selectEditableGroupTargets,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { AssignmentChipsRow } from "./AssignmentChipsRow.js"
import { GroupItem } from "./GroupItem.js"
import { RepoNameTemplateBuilder } from "./RepoNameTemplateBuilder.js"

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
  const updateGroupSetTemplate = useCourseStore((s) => s.updateGroupSetTemplate)
  const roster = useCourseStore((s) => s.course?.roster ?? null)
  const groupSetOperation = useUiStore((s) => s.groupSetOperation)
  const setNewAssignmentDialogOpen = useUiStore(
    (s) => s.setNewAssignmentDialogOpen,
  )
  const setPreSelectedGroupSetId = useUiStore((s) => s.setPreSelectedGroupSetId)
  const setAddGroupDialogGroupSetId = useUiStore(
    (s) => s.setAddGroupDialogGroupSetId,
  )
  const setDeleteGroupTargetId = useUiStore((s) => s.setDeleteGroupTargetId)

  const selectedAssignmentId = useUiStore(
    (s) => s.selectedAssignmentIdByGroupSet[groupSetId] ?? null,
  )
  const setSelectedAssignmentId = useUiStore((s) => s.setSelectedAssignmentId)

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

  // Resolve members
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
  const isReadOnly = kind === "system" || kind === "canvas" || kind === "moodle"
  const isSetEditable = !isReadOnly

  const template = groupSet.repoNameTemplate ?? defaultRepoTemplate
  const templateIncludesAssignment = template.includes("{assignment}")

  // Derive effective selected assignment for preview
  const effectiveAssignment: Assignment | null =
    assignments.length === 0
      ? null
      : assignments.length === 1
        ? assignments[0]
        : templateIncludesAssignment && selectedAssignmentId
          ? (assignments.find((a) => a.id === selectedAssignmentId) ??
            assignments[0])
          : assignments[0]

  const showAssignmentSelection =
    assignments.length > 1 && templateIncludesAssignment

  return (
    <div className="flex flex-col h-full">
      {/* Header: template + assignments + search */}
      <div className="px-4 py-2 space-y-2 border-b">
        <RepoNameTemplateBuilder
          template={template}
          onTemplateChange={(t) =>
            updateGroupSetTemplate(groupSetId, t || null)
          }
          disabled={isOperationActive}
        />
        <AssignmentChipsRow
          assignments={assignments}
          selectedId={
            showAssignmentSelection ? (effectiveAssignment?.id ?? null) : null
          }
          onSelect={(id) => setSelectedAssignmentId(groupSetId, id)}
          onAdd={() => {
            setPreSelectedGroupSetId(groupSetId)
            setNewAssignmentDialogOpen(true)
          }}
          onEdit={(id, name) => updateAssignment(id, { name })}
          onDelete={(id) => deleteAssignment(id)}
          showSelection={showAssignmentSelection}
          disabled={isOperationActive}
        />
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-auto px-4 py-2">
        <GroupsList
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
          template={template}
          effectiveAssignment={effectiveAssignment}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Groups list (replaces former GroupsTab)
// ---------------------------------------------------------------------------

function GroupsList({
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
  template,
  effectiveAssignment,
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
  template: string
  effectiveAssignment: Assignment | null
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

  const computePreview = useCallback(
    (group: Group): string | null => {
      if (!effectiveAssignment) return null
      const memberNames = group.memberIds
        .map((id) => memberById.get(id))
        .filter(
          (m): m is RosterMember => m !== undefined && m.status === "active",
        )
        .map((m) => m.name)
      const surnames = computeMembersSurnamesSlug(memberNames)
      return computeRepoName(template, effectiveAssignment, group, {
        surnames,
      })
    },
    [template, effectiveAssignment, memberById],
  )

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
              repoNamePreview={computePreview(group)}
            />
          )
        })}
      </div>

      {filteredGroups.length === 0 && query && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No members or groups match &ldquo;{search}&rdquo;
        </p>
      )}

      {/* Footer group count */}
      <p className="text-center text-xs text-muted-foreground pt-2 pb-1">
        {groups.length} {groups.length === 1 ? "group" : "groups"}
      </p>
    </div>
  )
}
