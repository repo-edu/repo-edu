import type { Roster } from "@repo-edu/backend-interface/types"
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
} from "@repo-edu/ui/components/icons"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { type IssueCard, useDataOverview } from "../../hooks/useDataOverview"
import { useProfileStore } from "../../stores/profileStore"
import { useToastStore } from "../../stores/toastStore"
import { useUiStore } from "../../stores/uiStore"

interface MembershipMatrixRow {
  studentId: string
  studentName: string
  memberships: Record<string, string>
}

export function DataOverviewSheet() {
  const open = useUiStore((state) => state.dataOverviewOpen)
  const setOpen = useUiStore((state) => state.setDataOverviewOpen)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const setAssignmentCoverageOpen = useUiStore(
    (state) => state.setAssignmentCoverageOpen,
  )
  const setAssignmentCoverageFocus = useUiStore(
    (state) => state.setAssignmentCoverageFocus,
  )
  const setStudentEditorOpen = useUiStore((state) => state.setStudentEditorOpen)
  const selectAssignment = useProfileStore((state) => state.selectAssignment)
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const addToast = useToastStore((state) => state.addToast)

  const { issueCards, rosterInsights } = useDataOverview()
  const [rosterOpen, setRosterOpen] = useState(true)
  const [matrixOpen, setMatrixOpen] = useState(true)

  const totalIssues = issueCards.length

  const handleIssueAction = (issue: IssueCard) => {
    const assignmentName = issue.assignmentId
      ? roster?.assignments.find((a) => a.id === issue.assignmentId)?.name
      : null

    const showToast = (message: string) =>
      addToast(message, { tone: "info", durationMs: 3000 })

    if (issue.kind === "unknown_students" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      setAssignmentCoverageFocus(null)
      showToast(
        `Showing groups${assignmentName ? ` in ${assignmentName}` : ""} (search for unknown students)`,
      )
      setOpen(false)
      return
    }

    if (issue.kind === "empty_groups" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      setAssignmentCoverageFocus(null)
      showToast(
        `Showing groups${assignmentName ? ` in ${assignmentName}` : ""} (look for empty groups)`,
      )
      setOpen(false)
      return
    }

    if (issue.kind === "unassigned_students" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      setAssignmentCoverageFocus("unassigned")
      setAssignmentCoverageOpen(true)
      showToast(
        `Showing unassigned students${assignmentName ? ` in ${assignmentName}` : ""}`,
      )
      setOpen(false)
      return
    }

    if (issue.kind === "roster_validation") {
      if (issue.issueKind === "duplicate_assignment_name") {
        setActiveTab("groups-assignments")
        showToast("Showing assignments")
      } else {
        setActiveTab("roster")
        setStudentEditorOpen(true)
        showToast("Showing roster issues")
      }
      setOpen(false)
      return
    }

    if (issue.kind === "assignment_validation" && issue.assignmentId) {
      setActiveTab("groups-assignments")
      selectAssignment(issue.assignmentId)
      showToast(
        `Showing groups${assignmentName ? ` in ${assignmentName}` : ""}`,
      )
      setOpen(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-2xl bg-background">
        <SheetHeader>
          <SheetTitle>Data Overview</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-5">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Issues ({totalIssues})
            </div>
            {issueCards.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No issues detected.
              </div>
            ) : (
              <div className="space-y-2">
                {issueCards.map((issue) => (
                  <IssueCardRow
                    key={issue.id}
                    issue={issue}
                    onAction={() => handleIssueAction(issue)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <MembershipMatrixSection
              roster={roster}
              open={matrixOpen}
              onOpenChange={setMatrixOpen}
            />
          </section>

          <section>
            <Collapsible open={rosterOpen} onOpenChange={setRosterOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Roster Insights</span>
                <ChevronDown
                  className={`size-4 transition-transform ${
                    rosterOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-sm">
                {rosterInsights ? (
                  <>
                    <div>
                      {rosterInsights.activeCount} active ·{" "}
                      {rosterInsights.droppedCount} dropped ·{" "}
                      {rosterInsights.incompleteCount} incomplete
                    </div>
                    <div className="text-muted-foreground">
                      {rosterInsights.missingEmailCount} missing email
                      {rosterInsights.missingGitUsernameCount > 0
                        ? ` · ${rosterInsights.missingGitUsernameCount} missing git usernames`
                        : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">No roster loaded.</div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MembershipMatrixSection({
  roster,
  open,
  onOpenChange,
}: {
  roster: Roster | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const matrixData = useMemo(() => {
    if (!roster) {
      return {
        rows: [] as MembershipMatrixRow[],
        groupSets: [] as { id: string; name: string }[],
      }
    }

    const groupById = new Map(roster.groups.map((group) => [group.id, group]))
    const sortedGroupSets = [...roster.group_sets].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    const seenSystemTypes = new Set<"individual_students" | "staff">()
    const dedupedGroupSets = sortedGroupSets.filter((groupSet) => {
      const connection = groupSet.connection
      if (connection?.kind !== "system") return true
      if (seenSystemTypes.has(connection.system_type)) return false
      seenSystemTypes.add(connection.system_type)
      return true
    })
    const groupSets = dedupedGroupSets.map((groupSet) => ({
      id: groupSet.id,
      name: groupSet.name,
    }))

    const rows: MembershipMatrixRow[] = roster.students.map((student) => {
      const memberships: Record<string, string> = {}

      for (const groupSet of dedupedGroupSets) {
        const memberGroupNames = groupSet.group_ids
          .map((groupId) => groupById.get(groupId))
          .filter((group): group is NonNullable<typeof group> => !!group)
          .filter((group) => group.member_ids.includes(student.id))
          .map((group) => group.name)

        memberships[groupSet.id] = memberGroupNames.join(", ")
      }

      return {
        studentId: student.id,
        studentName: student.name,
        memberships,
      }
    })

    return { rows, groupSets }
  }, [roster])

  const columns = useMemo<ColumnDef<MembershipMatrixRow>[]>(() => {
    const groupSetColumns: ColumnDef<MembershipMatrixRow>[] =
      matrixData.groupSets.map(
        (groupSet): ColumnDef<MembershipMatrixRow> => ({
          id: groupSet.id,
          accessorFn: (row) => row.memberships[groupSet.id] ?? "",
          header: (info) => (
            <SortHeaderButton label={groupSet.name} column={info.column} />
          ),
          cell: (info) => {
            const value = info.getValue() as string
            return value || "—"
          },
        }),
      )

    return [
      {
        id: "studentName",
        accessorFn: (row) => row.studentName,
        enableHiding: false,
        header: (info) => (
          <SortHeaderButton label="Student" column={info.column} />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.studentName}</span>
        ),
      },
      ...groupSetColumns,
    ]
  }, [matrixData.groupSets])

  const table = useReactTable({
    data: matrixData.rows,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "")
        .trim()
        .toLowerCase()
      if (!query) return true
      return row.original.studentName.toLowerCase().includes(query)
    },
  })

  const toggleableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Membership Matrix</span>
        <ChevronDown
          className={`size-4 transition-transform ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        <p className="text-xs text-muted-foreground">
          Cross-tab of students against group sets. Staff is excluded.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Filter students..."
            className="h-8 w-52"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSorting([])}
            disabled={sorting.length === 0}
          >
            Clear sort
          </Button>
        </div>

        {toggleableColumns.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {toggleableColumns.map((column) => (
              <div
                key={column.id}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Checkbox
                  size="sm"
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) =>
                    column.toggleVisibility(checked === true)
                  }
                />
                <span className="truncate max-w-36">
                  {matrixData.groupSets.find(
                    (groupSet) => groupSet.id === column.id,
                  )?.name ?? column.id}
                </span>
              </div>
            ))}
          </div>
        )}

        <DataTable className="max-h-72 overflow-auto" stickyHeader>
          <DataTableHeader>
            {table
              .getHeaderGroups()
              .map((headerGroup) =>
                headerGroup.headers.map((header) => (
                  <DataTableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </DataTableHead>
                )),
              )}
          </DataTableHeader>
          <DataTableBody>
            {table.getRowModel().rows.length === 0 ? (
              <DataTableEmptyRow
                colSpan={table.getAllLeafColumns().length}
                message={
                  matrixData.rows.length === 0
                    ? "No students or group sets available"
                    : "No students match this filter"
                }
              />
            ) : (
              table.getRowModel().rows.map((row) => (
                <DataTableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <DataTableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </DataTableCell>
                  ))}
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </CollapsibleContent>
    </Collapsible>
  )
}

function SortHeaderButton({
  label,
  column,
}: {
  label: string
  column: {
    getIsSorted: () => false | "asc" | "desc"
    toggleSorting: (desc?: boolean) => void
  }
}) {
  const sorted = column.getIsSorted()
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:underline"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span className="truncate">{label}</span>
      {sorted === "asc" ? (
        <ChevronUp className="size-3.5 shrink-0" />
      ) : sorted === "desc" ? (
        <ChevronDown className="size-3.5 shrink-0" />
      ) : (
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

function IssueCardRow({
  issue,
  onAction,
}: {
  issue: IssueCard
  onAction: () => void
}) {
  const actionLabel = getIssueActionLabel(issue)
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 text-warning" />
        <div className="flex-1 space-y-1">
          <div className="font-medium text-sm">{issue.title}</div>
          {issue.description && (
            <div className="text-xs text-muted-foreground">
              {issue.description}
            </div>
          )}
          {issue.details && (
            <ul className="text-xs text-muted-foreground">
              {issue.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

const getIssueActionLabel = (issue: IssueCard) => {
  switch (issue.kind) {
    case "unknown_students":
      return "View unknown"
    case "unassigned_students":
      return "View unassigned"
    case "empty_groups":
      return "View empty"
    case "roster_validation":
      return issue.issueKind === "duplicate_assignment_name"
        ? "View assignments"
        : "View roster"
    case "assignment_validation":
      return "View groups"
    default:
      return "View"
  }
}
