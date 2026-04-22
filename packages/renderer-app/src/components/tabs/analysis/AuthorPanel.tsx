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
  selectAuthorColorsByPersonId,
  selectAuthorDisplayByPersonId,
  selectFilteredAuthorStats,
  selectRosterMatchByPersonId,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { formatAge, type MetricTotals } from "../../../utils/analysis-format.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"
import { AuthorFilterControls } from "./AuthorFilterControls.js"
import { AuthorCharts } from "./charts/AuthorCharts.js"
import { MetricTotalsRow, useMetricColumns } from "./metric-columns.js"

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
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const showCommits = useAnalysisStore((s) => s.showCommits)
  const showInsertions = useAnalysisStore((s) => s.showInsertions)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const showLinesOfCode = useAnalysisStore((s) => s.showLinesOfCode)
  const chartMetric = useAnalysisStore((s) => s.chartMetric)
  const authorDisplayById = useAnalysisStore(selectAuthorDisplayByPersonId)
  const rosterMatchById = useAnalysisStore(selectRosterMatchByPersonId)
  const showEmail = useAnalysisStore((s) => s.showEmail)
  const showRosterMatch = useAnalysisStore((s) => s.showRosterMatch)
  const showAge = useAnalysisStore((s) => s.showAge)
  const toggleAuthor = useAnalysisStore((s) => s.toggleAuthor)
  const colors = useAnalysisStore(selectAuthorColorsByPersonId)

  const hasRosterMatches = result?.rosterMatches != null
  const rosterMatchColumnVisible = hasRosterMatches && showRosterMatch

  const isPercent = displayMode === "percentage"

  const totals = useMemo<MetricTotals>(
    () => ({
      commits: authorStats.reduce((sum, a) => sum + a.commits, 0),
      insertions: authorStats.reduce((sum, a) => sum + a.insertions, 0),
      deletions: authorStats.reduce((sum, a) => sum + a.deletions, 0),
      linesOfCode: authorStats.reduce((sum, a) => sum + a.lines, 0),
    }),
    [authorStats],
  )

  const dailyActivity = useMemo(() => {
    const visibleAuthorIds = new Set(
      authorStats.map((author) => author.personId),
    )
    return (result?.authorDailyActivity ?? []).filter((row) =>
      visibleAuthorIds.has(row.personId),
    )
  }, [authorStats, result])

  const [sorting, setSorting] = useState<SortingState>([
    { id: "linesOfCode", desc: true },
  ])

  const metricColumns = useMetricColumns<AuthorStats>({
    totals,
    isPercent,
    showLinesOfCode,
    showCommits,
    showInsertions,
    showDeletions,
  })

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
    ]

    if (showEmail) {
      cols.push({
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
          <span className="block max-w-80 truncate text-muted-foreground">
            {authorDisplayById.get(row.original.personId)?.email ??
              row.original.canonicalEmail}
          </span>
        ),
      })
    }

    if (rosterMatchColumnVisible) {
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

    cols.push(...metricColumns)

    if (showAge) {
      cols.push({
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
      })
    }

    return cols
  }, [
    authorDisplayById,
    colors,
    metricColumns,
    rosterMatchById,
    rosterMatchColumnVisible,
    showAge,
    showEmail,
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
      <AnalysisDisplayControls showIdentityToggles />
      <div className="flex-1 min-h-0 overflow-auto">
        <DataTable stickyHeader>
          <DataTableHeader>
            {(table.getHeaderGroups()[0]?.headers ?? []).map((header) => (
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
            {authorStats.length === 0 ? (
              <DataTableEmptyRow
                colSpan={columns.length}
                message="No author data."
              />
            ) : (
              <>
                <MetricTotalsRow
                  leading={
                    <DataTableCell
                      colSpan={
                        1 +
                        (showEmail ? 1 : 0) +
                        (rosterMatchColumnVisible ? 1 : 0)
                      }
                      className="sticky left-0 z-10 bg-background"
                    >
                      All authors
                    </DataTableCell>
                  }
                  trailing={showAge ? <DataTableCell /> : null}
                  totals={totals}
                  isPercent={isPercent}
                  showCommits={showCommits}
                  showInsertions={showInsertions}
                  showDeletions={showDeletions}
                  showLinesOfCode={showLinesOfCode}
                />
                {table.getRowModel().rows.map((row) => (
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
                ))}
              </>
            )}
          </DataTableBody>
        </DataTable>
        <AuthorCharts
          authorStats={authorStats}
          dailyActivity={dailyActivity}
          activeMetric={chartMetric}
        />
      </div>
      <AuthorFilterControls />
    </div>
  )
}
