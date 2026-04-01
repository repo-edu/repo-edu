import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type { Assignment, Group, RosterMember } from "@repo-edu/domain/types"
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
} from "@repo-edu/ui"
import { ArrowUp, Plus, Search } from "@repo-edu/ui/components/icons"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppSettingsStore } from "../../../../stores/app-settings-store.js"
import {
  type EditableGroupTarget,
  useCourseStore,
} from "../../../../stores/course-store.js"
import { useUiStore } from "../../../../stores/ui-store.js"
import {
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "../../../../utils/sorting.js"
import {
  buildGroupRows,
  createGroupColumns,
  groupColumnLabel,
} from "./columns.js"
import { OperationControls } from "./OperationControls.js"
import { useRepoOperations } from "./use-repo-operations.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCROLL_TOP_THRESHOLD = 0.15

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type GroupsTableProps = {
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupsTable({
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
}: GroupsTableProps) {
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

  const updateGroup = useCourseStore((s) => s.updateGroup)
  const moveMemberToGroup = useCourseStore((s) => s.moveMemberToGroup)
  const copyMemberToGroup = useCourseStore((s) => s.copyMemberToGroup)
  const course = useCourseStore((s) => s.course)

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
  const rows = useMemo(
    () => buildGroupRows(groups, memberById, template, effectiveAssignment),
    [groups, memberById, template, effectiveAssignment],
  )

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
  const columns = useMemo(
    () =>
      createGroupColumns({
        groupSetId,
        isSetEditable,
        disabled,
        staffIds,
        editableTargets,
        memberGroupIndex,
        onDeleteGroup,
        onSort: handleSort,
        updateGroup,
        moveMemberToGroup,
        copyMemberToGroup,
      }),
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
      columnVisibility: groupsColumnVisibility,
      columnSizing: groupsColumnSizing,
    },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
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

  const visibleRows = table.getFilteredRowModel().rows
  const showingCount = visibleRows.length
  const effectiveAssignmentId = effectiveAssignment?.id ?? null
  const { nonEmptyCount, emptyCount } = useMemo(() => {
    if (!course || effectiveAssignmentId === null) {
      return { nonEmptyCount: 0, emptyCount: 0 }
    }
    const plan = planRepositoryOperation(
      course.roster,
      effectiveAssignmentId,
      template,
    )
    if (!plan.ok) {
      return { nonEmptyCount: 0, emptyCount: 0 }
    }
    const skippedEmptyCount = plan.value.skippedGroups.filter(
      (group) => group.reason === "empty_group",
    ).length
    return {
      nonEmptyCount: plan.value.groups.length,
      emptyCount: skippedEmptyCount,
    }
  }, [course, effectiveAssignmentId, template])

  // Operations hook
  const ops = useRepoOperations({
    effectiveAssignmentId,
    nonEmptyCount,
    disabled,
  })

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
          <OperationControls
            groupSetId={groupSetId}
            disabled={disabled}
            operationStatus={ops.operationStatus}
            runningOperation={ops.runningOperation}
            operationError={ops.operationError}
            lastResult={ops.lastResult}
            handleRunOperation={ops.handleRunOperation}
            gitConnectionId={ops.gitConnectionId}
            hasBaseOperationInputs={ops.hasBaseOperationInputs}
            hasUpdateOperationInputs={ops.hasUpdateOperationInputs}
            nonEmptyCount={nonEmptyCount}
            emptyCount={emptyCount}
            organization={ops.organization}
            setOrganization={ops.setOrganization}
            templateKind={ops.templateKind}
            templateOwner={ops.templateOwner}
            templateLocalPath={ops.templateLocalPath}
            setTemplateKind={ops.setTemplateKind}
            setTemplateOwner={ops.setTemplateOwner}
            setTemplateLocalPath={ops.setTemplateLocalPath}
            cloneTargetDirectory={ops.cloneTargetDirectory}
            cloneDirectoryLayout={ops.cloneDirectoryLayout}
            setRepositoryCloneTargetDirectory={
              ops.setRepositoryCloneTargetDirectory
            }
            setRepositoryCloneDirectoryLayout={
              ops.setRepositoryCloneDirectoryLayout
            }
          />

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
          Showing {showingCount} of {rows.length} groups
        </div>
      )}
    </>
  )
}
