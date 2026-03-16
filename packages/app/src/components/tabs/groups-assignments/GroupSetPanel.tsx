import type { RepositoryBatchResult } from "@repo-edu/application-contract"
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
  Checkbox,
  Collapsible,
  CollapsibleContent,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import {
  ArrowUp,
  ChevronDown,
  Loader2,
  Plus,
  Search,
} from "@repo-edu/ui/components/icons"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getWorkflowClient } from "../../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import {
  type EditableGroupTarget,
  selectAssignmentsForGroupSet,
  selectEditableGroupTargets,
  selectGitConnectionId,
  selectGroupSetById,
  selectGroupsForGroupSet,
  selectOrganization,
  selectRepositoryCloneDirectoryLayout,
  selectRepositoryCloneTargetDirectory,
  selectRepositoryTemplate,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { getErrorMessage } from "../../../utils/error-message.js"
import {
  buildRepositoryWorkflowRequest,
  type CloneDirectoryLayout,
  type RepositoryOperationMode,
} from "../../../utils/repository-workflow.js"
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
  select: 40,
  group: 150,
  members: 450,
  memberCount: 60,
  repoName: 300,
} as const
const GROUPS_COLUMN_MIN_WIDTHS = {
  select: 36,
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
  const course = useCourseStore((s) => s.course)
  const gitConnectionId = useCourseStore(selectGitConnectionId)
  const organization = useCourseStore(selectOrganization)
  const setOrganization = useCourseStore((s) => s.setOrganization)
  const repositoryTemplate = useCourseStore(selectRepositoryTemplate)
  const setRepositoryTemplate = useCourseStore((s) => s.setRepositoryTemplate)
  const repositoryCloneTargetDirectory = useCourseStore(
    selectRepositoryCloneTargetDirectory,
  )
  const setRepositoryCloneTargetDirectory = useCourseStore(
    (s) => s.setRepositoryCloneTargetDirectory,
  )
  const repositoryCloneDirectoryLayout = useCourseStore(
    selectRepositoryCloneDirectoryLayout,
  )
  const setRepositoryCloneDirectoryLayout = useCourseStore(
    (s) => s.setRepositoryCloneDirectoryLayout,
  )

  const appSettings = useAppSettingsStore((s) => s.settings)
  const groupsColumnVisibility = useAppSettingsStore(
    (s) => s.settings.groupsColumnVisibility,
  )
  const setGroupsColumnVisibility = useAppSettingsStore(
    (s) => s.setGroupsColumnVisibility,
  )
  const groupsColumnSizing = useAppSettingsStore(
    (s) => s.settings.groupsColumnSizing,
  )
  const setGroupsColumnSizing = useAppSettingsStore(
    (s) => s.setGroupsColumnSizing,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)

  const groupCountFilterByGroupSet = useUiStore(
    (s) => s.groupCountFilterByGroupSet,
  )
  const setGroupCountFilter = useUiStore((s) => s.setGroupCountFilter)
  const groupOperationSectionByGroupSet = useUiStore(
    (s) => s.groupOperationSectionByGroupSet,
  )
  const setGroupOperationSection = useUiStore((s) => s.setGroupOperationSection)

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

  // Sorting
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [operationStatus, setOperationStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle")
  const [runningOperation, setRunningOperation] =
    useState<RepositoryOperationMode | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    operation: RepositoryOperationMode
    result: RepositoryBatchResult
  } | null>(null)

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

  const memberCountValues = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.memberCount))).sort(
        (a, b) => a - b,
      ),
    [rows],
  )
  const rawCountFilter = groupCountFilterByGroupSet[groupSetId] ?? {}
  const countFilter = useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const value of memberCountValues) {
      const key = String(value)
      next[key] = rawCountFilter[key] ?? true
    }
    return next
  }, [memberCountValues, rawCountFilter])

  useEffect(() => {
    if (memberCountValues.length === 0) {
      return
    }
    const hasMissingValue = memberCountValues.some(
      (value) => rawCountFilter[String(value)] === undefined,
    )
    if (!hasMissingValue) {
      return
    }
    setGroupCountFilter(groupSetId, countFilter)
  }, [
    countFilter,
    groupSetId,
    memberCountValues,
    rawCountFilter,
    setGroupCountFilter,
  ])

  // Apply member-count filter.
  const filteredRows = useMemo(() => {
    return rows.filter((row) => countFilter[String(row.memberCount)] ?? true)
  }, [countFilter, rows])
  const selectedCountFilterCount = useMemo(
    () =>
      memberCountValues.filter((value) => countFilter[String(value)] ?? true)
        .length,
    [countFilter, memberCountValues],
  )
  const allCountFiltersSelected =
    memberCountValues.length > 0 &&
    selectedCountFilterCount === memberCountValues.length
  const someCountFiltersSelected =
    selectedCountFilterCount > 0 && !allCountFiltersSelected

  // Column definitions
  const columns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
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
            onToggle={() => handleSort(column.id)}
          />
        ),
        sortingFn: compareGroupRowsByMemberCount,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.memberCount}</span>
        ),
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
      rowSelection,
      columnVisibility: groupsColumnVisibility,
      columnSizing: groupsColumnSizing,
    },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(groupsColumnSizing) : updater
      setGroupsColumnSizing(next)
    },
    onColumnVisibilityChange: (updater: Updater<VisibilityState>) => {
      const next =
        typeof updater === "function"
          ? updater(groupsColumnVisibility)
          : updater
      setGroupsColumnVisibility(next)
      void saveAppSettings()
    },
    enableRowSelection: true,
    getRowId: (row) => row.group.id,
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

  useEffect(() => {
    const validGroupIds = new Set(rows.map((row) => row.group.id))
    setRowSelection((current) => {
      const next: RowSelectionState = {}
      let changed = false
      for (const [groupId, selected] of Object.entries(current)) {
        if (!validGroupIds.has(groupId)) {
          changed = true
          continue
        }
        next[groupId] = selected
      }
      for (const row of rows) {
        if (next[row.group.id] === undefined) {
          next[row.group.id] = true
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [rows])

  const totalColumnSize = table.getTotalSize()
  const toColumnWidth = (size: number): string | undefined =>
    totalColumnSize > 0 ? `${(size / totalColumnSize) * 100}%` : undefined
  const isResizingColumn = table.getState().columnSizingInfo.isResizingColumn
  const prevIsResizingRef = useRef<string | false>(false)

  useEffect(() => {
    const wasResizing = prevIsResizingRef.current
    prevIsResizingRef.current = isResizingColumn
    if (wasResizing && !isResizingColumn) {
      void saveAppSettings()
    }
  }, [isResizingColumn, saveAppSettings])

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedGroupIds = selectedRows.map((row) => row.original.group.id)
  const selectedNonEmptyCount = selectedRows.filter(
    (row) => row.original.memberCount > 0,
  ).length
  const selectedEmptyCount = selectedRows.length - selectedNonEmptyCount
  const showingCount = table.getFilteredRowModel().rows.length
  const openSection = groupOperationSectionByGroupSet[groupSetId] ?? null
  const cloneTargetDirectory = repositoryCloneTargetDirectory ?? ""
  const cloneDirectoryLayout = (repositoryCloneDirectoryLayout ??
    "flat") as CloneDirectoryLayout
  const templateOwner = repositoryTemplate?.owner ?? ""
  const templateVisibility = repositoryTemplate?.visibility ?? "private"
  const effectiveAssignmentId = effectiveAssignment?.id ?? null
  const isRunning = operationStatus === "running"
  const hasBaseOperationInputs =
    !disabled &&
    !isRunning &&
    effectiveAssignmentId !== null &&
    gitConnectionId !== null &&
    selectedNonEmptyCount > 0

  const setTemplateOwner = useCallback(
    (owner: string) => {
      setRepositoryTemplate({
        owner,
        name: repositoryTemplate?.name ?? "",
        visibility: templateVisibility,
      })
    },
    [repositoryTemplate, setRepositoryTemplate, templateVisibility],
  )

  const handleRunOperation = useCallback(
    async (operation: RepositoryOperationMode) => {
      if (!course || !effectiveAssignmentId) {
        return
      }

      setOperationStatus("running")
      setRunningOperation(operation)
      setOperationError(null)
      setLastResult(null)

      const { workflowId, input } = buildRepositoryWorkflowRequest({
        course,
        appSettings,
        assignmentId: effectiveAssignmentId,
        operation,
        repositoryTemplate,
        targetDirectory: cloneTargetDirectory,
        directoryLayout: cloneDirectoryLayout,
        groupIds: selectedGroupIds,
      })

      try {
        const client = getWorkflowClient()
        const result = await client.run(workflowId, input)
        setOperationStatus("success")
        setLastResult({ operation, result })
      } catch (error) {
        setOperationStatus("error")
        setOperationError(getErrorMessage(error))
      } finally {
        setRunningOperation(null)
      }
    },
    [
      appSettings,
      cloneDirectoryLayout,
      cloneTargetDirectory,
      course,
      effectiveAssignmentId,
      repositoryTemplate,
      selectedGroupIds,
    ],
  )

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

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
      {/* Scrollable area: operation controls, header, search, table */}
      <div className="flex-1 min-h-0 relative pb-3">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div className="px-3 py-2 space-y-2 border-b">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={openSection === "create" ? "default" : "outline"}
                disabled={disabled}
                onClick={() =>
                  setGroupOperationSection(
                    groupSetId,
                    openSection === "create" ? null : "create",
                  )
                }
              >
                Create Repos
                <ChevronDown
                  className={`ml-1 size-4 transition-transform ${
                    openSection === "create" ? "rotate-180" : ""
                  }`}
                />
              </Button>
              <Button
                size="sm"
                variant={openSection === "clone" ? "default" : "outline"}
                disabled={disabled}
                onClick={() =>
                  setGroupOperationSection(
                    groupSetId,
                    openSection === "clone" ? null : "clone",
                  )
                }
              >
                Clone Repos
                <ChevronDown
                  className={`ml-1 size-4 transition-transform ${
                    openSection === "clone" ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </div>

            <Collapsible open={openSection === "create"}>
              <CollapsibleContent>
                <div className="border rounded-md p-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="group-set-create-organization">
                        Organization
                      </Label>
                      <Input
                        id="group-set-create-organization"
                        value={organization ?? ""}
                        onChange={(event) =>
                          setOrganization(event.target.value || null)
                        }
                        placeholder="e.g., course-org"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="group-set-create-template-owner">
                        Template Org
                      </Label>
                      <Input
                        id="group-set-create-template-owner"
                        value={templateOwner}
                        onChange={(event) =>
                          setTemplateOwner(event.target.value)
                        }
                        placeholder="e.g., template-org"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleRunOperation("create")}
                      disabled={!hasBaseOperationInputs}
                    >
                      {runningOperation === "create" ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        "Create Repos"
                      )}
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Will create {selectedNonEmptyCount} repositor
                      {selectedNonEmptyCount === 1 ? "y" : "ies"}.
                      {selectedEmptyCount > 0 && (
                        <span className="ml-1">
                          {selectedEmptyCount} empty group
                          {selectedEmptyCount === 1 ? "" : "s"} will be skipped.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={openSection === "clone"}>
              <CollapsibleContent>
                <div className="border rounded-md p-3 space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="space-y-1 md:flex-1">
                      <Label htmlFor="group-set-clone-target-folder">
                        Target Folder
                      </Label>
                      <Input
                        id="group-set-clone-target-folder"
                        value={cloneTargetDirectory}
                        onChange={(event) =>
                          setRepositoryCloneTargetDirectory(
                            event.target.value || null,
                          )
                        }
                        placeholder="e.g., ~/repos/course"
                      />
                    </div>
                    <div className="space-y-1 md:ml-auto md:shrink-0">
                      <Label htmlFor="group-set-clone-layout">
                        Directory Layout
                      </Label>
                      <Select
                        value={cloneDirectoryLayout}
                        onValueChange={(value) =>
                          setRepositoryCloneDirectoryLayout(
                            value as CloneDirectoryLayout,
                          )
                        }
                      >
                        <SelectTrigger
                          id="group-set-clone-layout"
                          className="w-full md:w-[16ch]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="w-[16ch] min-w-[16ch]">
                          <SelectItem value="flat">Flat</SelectItem>
                          <SelectItem value="by-team">By Team</SelectItem>
                          <SelectItem value="by-task">By Assignment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleRunOperation("clone")}
                      disabled={
                        !hasBaseOperationInputs ||
                        cloneTargetDirectory.trim().length === 0
                      }
                    >
                      {runningOperation === "clone" ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        "Clone Repos"
                      )}
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Will clone {selectedNonEmptyCount} repositor
                      {selectedNonEmptyCount === 1 ? "y" : "ies"}.
                      {selectedEmptyCount > 0 && (
                        <span className="ml-1">
                          {selectedEmptyCount} empty group
                          {selectedEmptyCount === 1 ? "" : "s"} will be skipped.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {gitConnectionId === null && (
              <p className="text-sm text-destructive">
                Configure a Git connection for this course before running
                repository operations.
              </p>
            )}
            {operationError && (
              <p className="text-sm text-destructive">{operationError}</p>
            )}
            {lastResult && (
              <p className="text-sm text-muted-foreground">
                {lastResult.result.repositoriesPlanned} repositor
                {lastResult.result.repositoriesPlanned === 1 ? "y" : "ies"}{" "}
                {lastResult.operation === "create" ? "created" : "cloned"} at{" "}
                {new Date(lastResult.result.completedAt).toLocaleTimeString()}.
              </p>
            )}
          </div>

          {/* Template + Assignments (scrolls away) */}
          {headerContent}

          {/* Search + actions */}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  # Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {memberCountValues.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No groups
                  </div>
                )}
                {memberCountValues.length > 0 && (
                  <DropdownMenuCheckboxItem
                    checked={
                      allCountFiltersSelected
                        ? true
                        : someCountFiltersSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) => {
                      const nextSelected = checked === true
                      const nextFilter: Record<string, boolean> = {}
                      for (const value of memberCountValues) {
                        nextFilter[String(value)] = nextSelected
                      }
                      setGroupCountFilter(groupSetId, nextFilter)
                    }}
                    onSelect={(event) => event.preventDefault()}
                  >
                    All
                  </DropdownMenuCheckboxItem>
                )}
                {memberCountValues.map((value) => {
                  const key = String(value)
                  return (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={countFilter[key] ?? true}
                      onCheckedChange={(checked) => {
                        setGroupCountFilter(groupSetId, {
                          ...countFilter,
                          [key]: checked === true,
                        })
                      }}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {value}
                    </DropdownMenuCheckboxItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={() => column.toggleVisibility()}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {groupColumnLabel(column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
                          : "No groups match the selected filters"}
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
      {showingCount < rows.length && (
        <div className="px-3 py-2 border-t text-sm text-muted-foreground">
          Showing {showingCount} of {rows.length} groups · {selectedRows.length}{" "}
          selected
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

function groupColumnLabel(columnId: string): string {
  const labels: Record<string, string> = {
    select: "Selection",
    name: "Group Name",
    members: "Members",
    memberCount: "#",
    repoName: "Repo Name",
  }
  return labels[columnId] ?? columnId
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
