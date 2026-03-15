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
  parseName,
  surnameSortKey,
} from "@repo-edu/domain"
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Text,
} from "@repo-edu/ui"
import {
  ArrowUp,
  ListFilter,
  Plus,
  Search,
} from "@repo-edu/ui/components/icons"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  selectGroupsHideIncomplete,
  useAppSettingsStore,
} from "../../../stores/app-settings-store.js"
import {
  type EditableGroupTarget,
  selectAssignmentsForGroupSet,
  selectEditableGroupTargets,
  selectGroupSetById,
  selectGroupsForGroupSet,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import {
  chainComparisons,
  compareNullableText,
  compareNumber,
  compareText,
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../utils/sorting.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AssignmentChipsRow } from "./AssignmentChipsRow.js"
import { GroupNameCell } from "./GroupNameCell.js"
import { MemberChip } from "./MemberChip.js"
import { RepoNameTemplateBuilder } from "./RepoNameTemplateBuilder.js"

/** Minimum scroll fraction before the back-to-top button appears. */
const SCROLL_TOP_THRESHOLD = 0.15
const GROUPS_COLUMN_WIDTHS = {
  group: 170,
  members: 470,
  memberCount: 60,
  repoName: 300,
} as const
const GROUPS_COLUMN_MIN_WIDTHS = {
  group: 100,
  members: 200,
  memberCount: 40,
  repoName: 100,
} as const

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

  const headerContent = (
    <div className="px-4 py-2 space-y-2 border-b">
      <RepoNameTemplateBuilder
        template={template}
        onTemplateChange={(t) => updateGroupSetTemplate(groupSetId, t || null)}
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

// ---------------------------------------------------------------------------
// Groups table (TanStack React Table)
// ---------------------------------------------------------------------------

type GroupRow = {
  group: Group
  members: RosterMember[]
  memberCount: number
  repoNamePreview: string | null
}

function GroupsTable({
  headerContent,
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
  headerContent: React.ReactNode
  groups: Group[]
  groupSetId: string
  memberById: Map<string, RosterMember>
  staffIds: Set<string>
  isSetEditable: boolean
  editableTargets: EditableGroupTarget[]
  memberGroupIndex: Map<string, Set<string>>
  disabled: boolean
  onAddGroup: () => void
  onDeleteGroup: (groupId: string) => void
  template: string
  effectiveAssignment: Assignment | null
}) {
  const updateGroup = useCourseStore((s) => s.updateGroup)
  const moveMemberToGroup = useCourseStore((s) => s.moveMemberToGroup)
  const copyMemberToGroup = useCourseStore((s) => s.copyMemberToGroup)

  // Scroll state
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    setShowBackToTop(
      maxScroll > 0 && el.scrollTop / maxScroll > SCROLL_TOP_THRESHOLD,
    )
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener("scroll", updateScrollState, { passive: true })
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollState)
      observer.disconnect()
    }
  }, [updateScrollState])

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  // Search
  const [globalFilter, setGlobalFilter] = useState("")

  // Filter: hide incomplete groups (persisted)
  const hideIncomplete = useAppSettingsStore(selectGroupsHideIncomplete)
  const setGroupsHideIncomplete = useAppSettingsStore(
    (s) => s.setGroupsHideIncomplete,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)

  // Sorting
  const [sorting, setSorting] = useState<SortingState>([])

  const handleSort = useCallback((columnId: string) => {
    setSorting((current) => getNextProgressiveSorting(current, columnId))
  }, [])

  const handleSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting((current) =>
      normalizeProgressiveSorting(
        typeof updater === "function" ? updater(current) : updater,
      ),
    )
  }, [])

  // Pre-resolve group rows
  const rows = useMemo<GroupRow[]>(() => {
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
  }, [groups, memberById, template, effectiveAssignment])

  // Apply incomplete-group filter
  const filteredRows = useMemo(() => {
    if (!hideIncomplete || rows.length === 0) return rows
    const maxSize = Math.max(...rows.map((r) => r.memberCount))
    return rows.filter((r) => r.memberCount >= maxSize)
  }, [rows, hideIncomplete])

  // Column definitions
  const columns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
      {
        id: "name",
        size: GROUPS_COLUMN_WIDTHS.group,
        minSize: GROUPS_COLUMN_MIN_WIDTHS.group,
        accessorFn: (row) => row.group.name,
        header: ({ column }) => (
          <SortHeaderButton
            label="Group"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
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
            onToggle={() => handleSort(column.id)}
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
        id: "memberCount",
        size: GROUPS_COLUMN_WIDTHS.memberCount,
        minSize: GROUPS_COLUMN_MIN_WIDTHS.memberCount,
        accessorFn: (row) => row.memberCount,
        header: ({ column }) => (
          <SortHeaderButton
            label="#"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareGroupRowsByMemberCount,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.memberCount}</span>
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
    ],
    [
      groupSetId,
      isSetEditable,
      disabled,
      staffIds,
      editableTargets,
      memberGroupIndex,
      onDeleteGroup,
      handleSort,
      updateGroup,
      moveMemberToGroup,
      copyMemberToGroup,
    ],
  )

  const table = useReactTable({
    data: filteredRows,
    columns,
    columnResizeMode: "onChange",
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const query = filterValue.trim().toLowerCase()
      if (!query) return true
      const { group, members } = row.original
      if (group.name.toLowerCase().includes(query)) return true
      return members.some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query),
      )
    },
  })
  const totalColumnSize = table.getTotalSize()
  const toColumnWidth = (size: number): string | undefined =>
    totalColumnSize > 0 ? `${(size / totalColumnSize) * 100}%` : undefined

  // Empty state
  if (groups.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-3">No groups in this set.</p>
          {isSetEditable && (
            <Button size="sm" variant="outline" onClick={onAddGroup}>
              <Plus className="size-4 mr-1" />
              Add Group
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Scrollable area: search, table */}
      <div className="flex-1 min-h-0 relative pb-3">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          {/* Template + Assignments (scrolls away) */}
          {headerContent}

          {/* Search + Add Group */}
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 size-4" />
              <Input
                placeholder="Search members and groups..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <ListFilter className="size-4 mr-1" />
                  Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={hideIncomplete}
                  onCheckedChange={(v) => {
                    setGroupsHideIncomplete(!!v)
                    void saveAppSettings()
                  }}
                  onSelect={(e) => e.preventDefault()}
                >
                  Hide incomplete groups
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

          {/* Groups table */}
          <div className="px-3 pb-2">
            <div className="border rounded mb-2">
              <table
                className={`w-full text-sm ${table.getState().columnSizingInfo.isResizingColumn ? "select-none" : ""}`}
                style={{ tableLayout: "fixed" }}
              >
                <thead className="bg-muted">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="bg-muted sticky top-0 z-10 p-2 text-left font-medium relative min-w-0"
                          style={{ width: toColumnWidth(header.getSize()) }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                          {header.column.getCanResize() && (
                            // biome-ignore lint/a11y/noStaticElementInteractions: column resize handle uses mouse/touch drag
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 ${
                                header.column.getIsResizing()
                                  ? "bg-primary"
                                  : ""
                              }`}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-muted/50">
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="p-2 align-top min-w-0 overflow-hidden"
                          style={{
                            width: toColumnWidth(cell.column.getSize()),
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={table.getVisibleLeafColumns().length}
                        className="p-4 text-center text-muted-foreground"
                      >
                        {globalFilter
                          ? "No groups or members match search"
                          : hideIncomplete
                            ? "No complete groups found"
                            : "No groups"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Back to top button */}
        {showBackToTop && (
          <button
            type="button"
            onClick={scrollToTop}
            className="absolute bottom-3 right-6 z-20 size-7 flex items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            title="Scroll to top"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
      {hideIncomplete && (
        <div className="px-3 py-2 border-t text-sm text-muted-foreground">
          Showing {filteredRows.length} of {rows.length} groups
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
