import type { MemberStatus, RosterMember } from "@repo-edu/domain/types"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { chainComparisons, compareText } from "../../../utils/sorting.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { EditableTextCell } from "./cells/EditableTextCell.js"
import { StatusCell } from "./cells/StatusSelectCell.js"
import {
  compareRosterMemberEmails,
  compareRosterMemberGitUsernames,
  compareRosterMemberNames,
  compareRosterMemberRoles,
  compareRosterMemberStatuses,
  compareRosterMembersByName,
  getStatusIcon,
  memberTypeLabel,
} from "./MemberListHelpers.js"

const ROSTER_COLUMN_WIDTHS = {
  name: 200,
  email: 260,
  status: 110,
  memberType: 90,
  groups: 150,
  gitUsername: 190,
} as const
const ROSTER_COLUMN_MIN_WIDTHS = {
  name: 100,
  email: 120,
  status: 80,
  memberType: 60,
  groups: 80,
  gitUsername: 100,
} as const

type UseMemberColumnsArgs = {
  memberGroupNames: Map<string, string[]>
  onSort: (columnId: string) => void
  onUpdateName: (id: string, name: string) => void
  onUpdateEmail: (id: string, email: string) => void
  onUpdateGitUsername: (id: string, gitUsername: string) => void
  onUpdateStatus: (id: string, status: MemberStatus) => void
  onRequestPermanentDelete: (id: string) => void
}

export function useMemberColumns({
  memberGroupNames,
  onSort,
  onUpdateName,
  onUpdateEmail,
  onUpdateGitUsername,
  onUpdateStatus,
  onRequestPermanentDelete,
}: UseMemberColumnsArgs): ColumnDef<RosterMember>[] {
  return useMemo<ColumnDef<RosterMember>[]>(
    () => [
      {
        id: "name",
        size: ROSTER_COLUMN_WIDTHS.name,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.name,
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <SortHeaderButton
            label="Name"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => onSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberNames,
        cell: ({ row }) => (
          <EditableTextCell
            value={row.original.name}
            onSave={(value) => onUpdateName(row.original.id, value)}
            editable={row.original.source !== "lms"}
          />
        ),
      },
      {
        id: "email",
        size: ROSTER_COLUMN_WIDTHS.email,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.email,
        accessorFn: (row) => row.email,
        header: ({ column }) => (
          <SortHeaderButton
            label="Email"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => onSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberEmails,
        cell: ({ row }) => (
          <div className="min-w-0">
            <EditableTextCell
              value={row.original.email}
              onSave={(value) => onUpdateEmail(row.original.id, value)}
              editable={row.original.source !== "lms"}
              truncate
            />
          </div>
        ),
      },
      {
        id: "status",
        size: ROSTER_COLUMN_WIDTHS.status,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.status,
        accessorFn: (row) => row.status,
        header: ({ column }) => (
          <SortHeaderButton
            label="Status"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => onSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberStatuses,
        cell: ({ row }) => (
          <StatusCell
            status={row.original.status}
            lmsStatus={row.original.lmsStatus ?? null}
            source={row.original.source}
            onChange={(status) => onUpdateStatus(row.original.id, status)}
            onDeletePermanent={() => onRequestPermanentDelete(row.original.id)}
          />
        ),
      },
      {
        id: "memberType",
        size: ROSTER_COLUMN_WIDTHS.memberType,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.memberType,
        accessorFn: (row) => memberTypeLabel(row),
        header: ({ column }) => (
          <SortHeaderButton
            label="Role"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => onSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberRoles,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {memberTypeLabel(row.original)}
          </span>
        ),
      },
      {
        id: "groups",
        size: ROSTER_COLUMN_WIDTHS.groups,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.groups,
        accessorFn: (row) => memberGroupNames.get(row.id)?.join(", ") ?? "",
        header: ({ column }) => (
          <SortHeaderButton
            label="Groups"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => onSort(column.id)}
          />
        ),
        sortingFn: (rowA, rowB) =>
          chainComparisons(
            compareText(
              memberGroupNames.get(rowA.original.id)?.join(", ") ?? "",
              memberGroupNames.get(rowB.original.id)?.join(", ") ?? "",
            ),
            compareRosterMembersByName(rowA.original, rowB.original),
          ),
        cell: ({ row }) => {
          const names = memberGroupNames.get(row.original.id)
          if (!names || names.length === 0) return null
          const text = names.join(", ")
          return (
            <span className="text-muted-foreground truncate block" title={text}>
              {text}
            </span>
          )
        },
      },
      {
        id: "gitUsername",
        size: ROSTER_COLUMN_WIDTHS.gitUsername,
        minSize: ROSTER_COLUMN_MIN_WIDTHS.gitUsername,
        accessorFn: (row) => row.gitUsername ?? "",
        header: ({ column }) => (
          <SortHeaderButton
            label="Git Username"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => onSort(column.id)}
          />
        ),
        sortingFn: compareRosterMemberGitUsernames,
        cell: ({ row }) => (
          <EditableTextCell
            value={row.original.gitUsername ?? ""}
            onSave={(value) => onUpdateGitUsername(row.original.id, value)}
            trailing={getStatusIcon(row.original.gitUsernameStatus)}
          />
        ),
      },
    ],
    [
      onSort,
      memberGroupNames,
      onUpdateName,
      onUpdateEmail,
      onUpdateGitUsername,
      onUpdateStatus,
      onRequestPermanentDelete,
    ],
  )
}
