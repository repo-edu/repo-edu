import { defaultRepoTemplate } from "@repo-edu/domain/repository-planning"
import type {
  Assignment,
  GroupSetConnection,
  RosterMember,
} from "@repo-edu/domain/types"
import { EmptyState, Text } from "@repo-edu/ui"
import { useMemo } from "react"
import {
  selectAssignmentsForGroupSet,
  selectEditableGroupTargets,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { AssignmentChipsRow } from "./AssignmentChipsRow.js"
import { GroupsTable } from "./GroupSetGroupsTable/index.js"
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
  const isSetEditable = !isReadOnly && groupSet.nameMode === "named"

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

  const headerContent = (
    <div className="px-4 py-2 space-y-2 border-b">
      <RepoNameTemplateBuilder
        template={template}
        onTemplateChange={(t) => updateGroupSetTemplate(groupSetId, t || null)}
        disabled={isOperationActive}
        hiddenSegments={
          groupSet.nameMode === "unnamed"
            ? ["group", "surnames"]
            : kind === "canvas" || kind === "moodle"
              ? ["members"]
              : undefined
        }
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
  )

  return (
    <div className="flex flex-col h-full">
      {/* Groups table */}
      <GroupsTable
        headerContent={headerContent}
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
  )
}
