import { computeRepoName } from "@repo-edu/domain/repository-planning"
import {
  computeMembersSurnamesSlug,
  parseName,
  surnameSortKey,
} from "@repo-edu/domain/roster"
import type { Assignment, Group, RosterMember } from "@repo-edu/domain/types"
import { Checkbox } from "@repo-edu/ui"
import type { ColumnDef } from "@tanstack/react-table"
import type { EditableGroupTarget } from "../../../../stores/course-store.js"
import {
  chainComparisons,
  compareNullableText,
  compareNumber,
  compareText,
} from "../../../../utils/sorting.js"
import { SortHeaderButton } from "../../../common/SortHeaderButton.js"
import { GroupNameCell } from "../GroupNameCell.js"
import { MemberChip } from "../MemberChip.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupRow = {
  group: Group
  members: RosterMember[]
  memberCount: number
  repoNamePreview: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GROUPS_COLUMN_WIDTHS = {
  select: 40,
  group: 150,
  members: 450,
  memberCount: 60,
  repoName: 300,
} as const

export const GROUPS_COLUMN_MIN_WIDTHS = {
  select: 36,
  group: 100,
  members: 200,
  memberCount: 40,
  repoName: 100,
} as const

// ---------------------------------------------------------------------------
// Row builder
// ---------------------------------------------------------------------------

export function buildGroupRows(
  groups: Group[],
  memberById: Map<string, RosterMember>,
  template: string,
  effectiveAssignment: Assignment | null,
): GroupRow[] {
  return groups.map((group) => {
    const members = group.memberIds
      .map((id) => memberById.get(id))
      .filter(
        (m): m is RosterMember => m !== undefined && m.status === "active",
      )
      .sort((a, b) =>
        surnameSortKey(parseName(a.name).surname).localeCompare(
          surnameSortKey(parseName(b.name).surname),
          undefined,
          { sensitivity: "base" },
        ),
      )

    const memberNames = members.map((m) => m.name)
    const surnames = computeMembersSurnamesSlug(memberNames)
    const repoNamePreview = computeRepoName(
      template,
      effectiveAssignment,
      group,
      { surnames },
    )

    return { group, members, memberCount: members.length, repoNamePreview }
  })
}

// ---------------------------------------------------------------------------
// Column factory
// ---------------------------------------------------------------------------

type ColumnFactoryParams = {
  groupSetId: string
  isSetEditable: boolean
  disabled: boolean
  staffIds: Set<string>
  editableTargets: EditableGroupTarget[]
  memberGroupIndex: Map<string, Set<string>>
  onDeleteGroup: (groupId: string) => void
  onSort: (columnId: string) => void
  updateGroup: (groupId: string, patch: { memberIds: string[] }) => void
  moveMemberToGroup: (
    memberId: string,
    sourceGroupId: string,
    targetGroupId: string,
  ) => void
  copyMemberToGroup: (memberId: string, targetGroupId: string) => void
}

export function createGroupColumns(
  params: ColumnFactoryParams,
): ColumnDef<GroupRow>[] {
  const {
    groupSetId,
    isSetEditable,
    disabled,
    staffIds,
    editableTargets,
    memberGroupIndex,
    onDeleteGroup,
    onSort,
    updateGroup,
    moveMemberToGroup,
    copyMemberToGroup,
  } = params

  return [
    {
      id: "select",
      size: GROUPS_COLUMN_WIDTHS.select,
      minSize: GROUPS_COLUMN_MIN_WIDTHS.select,
      enableSorting: false,
      accessorFn: (row) => row.group.id,
      header: ({ table }) => {
        const visibleRows = table.getFilteredRowModel().rows
        const selectedVisible = visibleRows.filter((row) =>
          row.getIsSelected(),
        ).length
        const allSelected =
          visibleRows.length > 0 && selectedVisible === visibleRows.length
        const someSelected = selectedVisible > 0 && !allSelected

        return (
          <Checkbox
            checked={
              allSelected ? true : someSelected ? "indeterminate" : false
            }
            onCheckedChange={(checked) => {
              const nextSelected = checked === true
              for (const row of visibleRows) {
                row.toggleSelected(nextSelected)
              }
            }}
            aria-label="Select all visible groups"
            size="sm"
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          aria-label={`Select group ${row.original.group.name}`}
          size="sm"
        />
      ),
    },
    {
      id: "name",
      size: GROUPS_COLUMN_WIDTHS.group,
      minSize: GROUPS_COLUMN_MIN_WIDTHS.group,
      accessorFn: (row) => row.group.name,
      header: ({ column }) => (
        <SortHeaderButton
          label="Group Name"
          canSort={column.getCanSort()}
          sorted={column.getIsSorted()}
          onToggle={() => onSort(column.id)}
        />
      ),
      sortingFn: compareGroupRowsByName,
      cell: ({ row }) => (
        <GroupNameCell
          group={row.original.group}
          groupSetId={groupSetId}
          isSetEditable={isSetEditable}
          disabled={disabled}
          onDeleteGroup={() => onDeleteGroup(row.original.group.id)}
        />
      ),
    },
    {
      id: "repoName",
      size: GROUPS_COLUMN_WIDTHS.repoName,
      minSize: GROUPS_COLUMN_MIN_WIDTHS.repoName,
      accessorFn: (row) => row.repoNamePreview,
      header: ({ column }) => (
        <SortHeaderButton
          label="Repo Name"
          canSort={column.getCanSort()}
          sorted={column.getIsSorted()}
          onToggle={() => onSort(column.id)}
        />
      ),
      sortingFn: compareGroupRowsByRepoName,
      cell: ({ row }) => (
        <span className="block text-sm text-muted-foreground">
          {insertWordBreaks(row.original.repoNamePreview ?? "")}
        </span>
      ),
    },
    {
      id: "members",
      size: GROUPS_COLUMN_WIDTHS.members,
      minSize: GROUPS_COLUMN_MIN_WIDTHS.members,
      enableSorting: false,
      header: () => <span className="font-medium">Members</span>,
      cell: ({ row }) => {
        const { group, members } = row.original
        const isEditable = group.origin === "local"

        return (
          <div className="flex flex-wrap gap-1">
            {members.map((member) => (
              <MemberChip
                key={member.id}
                member={member}
                isStaff={staffIds.has(member.id)}
                sourceGroupId={group.id}
                sourceGroupEditable={isEditable}
                editableTargets={editableTargets}
                memberGroupIds={memberGroupIndex.get(member.id) ?? new Set()}
                onRemove={
                  isEditable && !disabled
                    ? () =>
                        updateGroup(group.id, {
                          memberIds: group.memberIds.filter(
                            (id) => id !== member.id,
                          ),
                        })
                    : undefined
                }
                onMove={
                  isEditable && !disabled
                    ? (targetId) =>
                        moveMemberToGroup(member.id, group.id, targetId)
                    : undefined
                }
                onCopy={
                  !disabled
                    ? (targetId) => copyMemberToGroup(member.id, targetId)
                    : undefined
                }
              />
            ))}
          </div>
        )
      },
    },
    {
      id: "memberCount",
      size: GROUPS_COLUMN_WIDTHS.memberCount,
      minSize: GROUPS_COLUMN_MIN_WIDTHS.memberCount,
      accessorFn: (row) => row.memberCount,
      header: ({ column }) => (
        <SortHeaderButton
          label="#"
          canSort={column.getCanSort()}
          sorted={column.getIsSorted()}
          onToggle={() => onSort(column.id)}
        />
      ),
      sortingFn: compareGroupRowsByMemberCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.memberCount}</span>
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function groupColumnLabel(columnId: string): string {
  const labels: Record<string, string> = {
    select: "Selection",
    name: "Group Name",
    members: "Members",
    memberCount: "#",
    repoName: "Repo Name",
  }
  return labels[columnId] ?? columnId
}

/** Insert word-break opportunities (`<wbr>`) after hyphens so long
 *  hyphenated repo names wrap at natural boundaries. */
function insertWordBreaks(text: string): React.ReactNode {
  if (!text.includes("-")) return text
  const parts = text.split("-")
  return parts.map((part, i) =>
    i < parts.length - 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: stable split output
      <span key={i}>
        {part}-<wbr />
      </span>
    ) : (
      part
    ),
  )
}

// ---------------------------------------------------------------------------
// Sorting comparators
// ---------------------------------------------------------------------------

function compareGroupRowsByName(
  rowA: { original: GroupRow },
  rowB: { original: GroupRow },
): number {
  return chainComparisons(
    compareText(rowA.original.group.name, rowB.original.group.name),
    compareNumber(rowA.original.memberCount, rowB.original.memberCount),
  )
}

function compareGroupRowsByMemberCount(
  rowA: { original: GroupRow },
  rowB: { original: GroupRow },
): number {
  return chainComparisons(
    compareNumber(rowA.original.memberCount, rowB.original.memberCount),
    compareText(rowA.original.group.name, rowB.original.group.name),
  )
}

function compareGroupRowsByRepoName(
  rowA: { original: GroupRow },
  rowB: { original: GroupRow },
): number {
  return chainComparisons(
    compareNullableText(
      rowA.original.repoNamePreview,
      rowB.original.repoNamePreview,
    ),
    compareText(rowA.original.group.name, rowB.original.group.name),
  )
}
