import type {
  AuthorStats,
  IdentityConfidence,
  IdentityMatch,
} from "@repo-edu/domain/analysis"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
} from "@repo-edu/ui"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import {
  selectAuthorDisplayByPersonId,
  selectFilteredAuthorStats,
  selectRosterMatchByPersonId,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import {
  formatAge,
  formatCount,
  formatPercent,
} from "../../../utils/analysis-format.js"
import { authorColorMap } from "../../../utils/author-colors.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"
import { AuthorFilterControls } from "./AuthorFilterControls.js"
import { AuthorCharts } from "./charts/AuthorCharts.js"

export const confidenceStyles: Record<IdentityConfidence, string> = {
  "exact-email": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "fuzzy-name": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  unmatched: "",
}

const confidenceLabels: Record<IdentityConfidence, string> = {
  "exact-email": "email",
  "fuzzy-name": "fuzzy",
  unmatched: "",
}

export function getConfidenceBadgeLabel(
  confidence: IdentityConfidence,
): string | null {
  return confidenceLabels[confidence] || null
}

export function getRosterMatchCell(match?: IdentityMatch): {
  memberName: string | null
  confidence: IdentityConfidence | null
} {
  if (!match) {
    return { memberName: null, confidence: null }
  }
  return {
    memberName: match.memberName,
    confidence: match.confidence,
  }
}

export function ConfidenceBadge({
  confidence,
}: {
  confidence: IdentityConfidence
}) {
  const label = getConfidenceBadgeLabel(confidence)
  if (!label) return null
  return (
    <span
      className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${confidenceStyles[confidence]}`}
    >
      {label}
    </span>
  )
}

export function AuthorPanel() {
  const result = useAnalysisStore((s) => s.result)
  const authorStats = useAnalysisStore(selectFilteredAuthorStats)
  const activeMetric = useAnalysisStore((s) => s.activeMetric)
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const scaledPercentages = useAnalysisStore((s) => s.scaledPercentages)
  const authorDisplayById = useAnalysisStore(selectAuthorDisplayByPersonId)
  const rosterMatchById = useAnalysisStore(selectRosterMatchByPersonId)
  const toggleAuthor = useAnalysisStore((s) => s.toggleAuthor)

  const [sorting, setSorting] = useState<SortingState>([
    { id: "commits", desc: true },
  ])

  const hasRosterMatches = result?.rosterMatches != null

  const allAuthorIds = useMemo(
    () => (result?.authorStats ?? []).map((a) => a.personId),
    [result],
  )
  const colors = useMemo(() => authorColorMap(allAuthorIds), [allAuthorIds])
  const totalDeletions = useMemo(
    () => authorStats.reduce((sum, author) => sum + author.deletions, 0),
    [authorStats],
  )
  const totalLines = useMemo(
    () => authorStats.reduce((sum, author) => sum + author.lines, 0),
    [authorStats],
  )
  const totalInsertions = useMemo(
    () => authorStats.reduce((sum, author) => sum + author.insertions, 0),
    [authorStats],
  )

  const isPercent = displayMode === "percentage"
  const dailyActivity = useMemo(() => {
    const visibleAuthorIds = new Set(
      authorStats.map((author) => author.personId),
    )
    return (result?.authorDailyActivity ?? []).filter((row) =>
      visibleAuthorIds.has(row.personId),
    )
  }, [authorStats, result])

  const columns = useMemo<ColumnDef<AuthorStats>[]>(() => {
    const cols: ColumnDef<AuthorStats>[] = [
      {
        id: "author",
        accessorFn: (row) => row.canonicalName,
        header: ({ column }) => (
          <SortHeaderButton
            label="Author"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const color = colors.get(row.original.personId) ?? "#888"
          const display = authorDisplayById.get(row.original.personId)
          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="inline-block size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">
                {display?.name ?? row.original.canonicalName}
              </span>
            </div>
          )
        },
      },
      {
        id: "email",
        accessorFn: (row) => row.canonicalEmail,
        header: ({ column }) => (
          <SortHeaderButton
            label="Email"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground block max-w-80">
            {authorDisplayById.get(row.original.personId)?.email ??
              row.original.canonicalEmail}
          </span>
        ),
      },
    ]

    if (hasRosterMatches) {
      cols.push({
        id: "rosterMatch",
        accessorFn: (row) =>
          rosterMatchById.get(row.personId)?.memberName ?? "",
        header: ({ column }) => (
          <SortHeaderButton
            label="Roster Match"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const cell = getRosterMatchCell(
            rosterMatchById.get(row.original.personId),
          )
          if (!cell.memberName || !cell.confidence) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{cell.memberName}</span>
              <ConfidenceBadge confidence={cell.confidence} />
            </div>
          )
        },
      })
    }

    cols.push(
      {
        id: "commits",
        accessorFn: (row) => row.commits,
        header: ({ column }) => (
          <SortHeaderButton
            label="Commits"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatCount(row.original.commits),
      },
      {
        id: "insertions",
        accessorFn: (row) =>
          isPercent ? row.insertionsPercent : row.insertions,
        header: ({ column }) => (
          <SortHeaderButton
            label={isPercent ? "Ins %" : "Insertions"}
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) =>
          isPercent
            ? formatPercent(row.original.insertionsPercent)
            : formatCount(row.original.insertions),
      },
    )

    if (showDeletions) {
      cols.push({
        id: "deletions",
        accessorFn: (row) =>
          isPercent && totalDeletions > 0
            ? (100 * row.deletions) / totalDeletions
            : row.deletions,
        header: ({ column }) => (
          <SortHeaderButton
            label={isPercent ? "Del %" : "Deletions"}
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) =>
          isPercent && totalDeletions > 0
            ? formatPercent((100 * row.original.deletions) / totalDeletions)
            : formatCount(row.original.deletions),
      })
    }

    cols.push(
      {
        id: "lines",
        accessorFn: (row) => (isPercent ? row.linesPercent : row.lines),
        header: ({ column }) => (
          <SortHeaderButton
            label={isPercent ? "Lines %" : "Lines"}
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) =>
          isPercent
            ? formatPercent(row.original.linesPercent)
            : formatCount(row.original.lines),
      },
      {
        id: "stability",
        accessorFn: (row) => row.stability,
        header: ({ column }) => (
          <SortHeaderButton
            label="Stability %"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatPercent(row.original.stability),
      },
      {
        id: "age",
        accessorFn: (row) => row.age,
        header: ({ column }) => (
          <SortHeaderButton
            label="Age"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatAge(row.original.age),
      },
    )

    if (scaledPercentages) {
      cols.push(
        {
          id: "scaledLinesPercent",
          accessorFn: (row) =>
            totalLines > 0 ? (100 * row.lines) / totalLines : 0,
          header: ({ column }) => (
            <SortHeaderButton
              label="Scaled Lines %"
              canSort={column.getCanSort()}
              sorted={column.getIsSorted()}
              onToggle={() => column.toggleSorting()}
            />
          ),
          cell: ({ row }) =>
            formatPercent(
              totalLines > 0 ? (100 * row.original.lines) / totalLines : 0,
            ),
        },
        {
          id: "scaledInsertionsPercent",
          accessorFn: (row) =>
            totalInsertions > 0 ? (100 * row.insertions) / totalInsertions : 0,
          header: ({ column }) => (
            <SortHeaderButton
              label="Scaled Ins %"
              canSort={column.getCanSort()}
              sorted={column.getIsSorted()}
              onToggle={() => column.toggleSorting()}
            />
          ),
          cell: ({ row }) =>
            formatPercent(
              totalInsertions > 0
                ? (100 * row.original.insertions) / totalInsertions
                : 0,
            ),
        },
      )
    }

    return cols
  }, [
    authorDisplayById,
    colors,
    hasRosterMatches,
    isPercent,
    rosterMatchById,
    scaledPercentages,
    showDeletions,
    totalDeletions,
    totalInsertions,
    totalLines,
  ])

  const table = useReactTable({
    data: authorStats,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.personId,
  })

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="Run an analysis to see author statistics." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AnalysisDisplayControls />
      <div className="flex-1 min-h-0 overflow-auto">
        <DataTable stickyHeader>
          <DataTableHeader>
            {table.getHeaderGroups()[0].headers.map((header) => (
              <DataTableHead
                key={header.id}
                className={header.id === "author" ? "sticky left-0 z-20" : ""}
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </DataTableHead>
            ))}
          </DataTableHeader>
          <DataTableBody>
            {table.getRowModel().rows.length === 0 ? (
              <DataTableEmptyRow
                colSpan={columns.length}
                message="No author data."
              />
            ) : (
              table.getRowModel().rows.map((row) => (
                <DataTableRow
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={() => toggleAuthor(row.original.personId)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <DataTableCell
                      key={cell.id}
                      className={
                        cell.column.id === "author"
                          ? "sticky left-0 z-10 bg-background group-hover:bg-muted/50"
                          : ""
                      }
                    >
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
        <AuthorCharts
          authorStats={authorStats}
          dailyActivity={dailyActivity}
          activeMetric={activeMetric}
        />
      </div>
      <AuthorFilterControls />
    </div>
  )
}
