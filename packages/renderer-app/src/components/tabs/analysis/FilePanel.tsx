import type { FileStats } from "@repo-edu/domain/analysis"
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
  FILES_PANEL_CHART_FLEX,
  FILES_PANEL_TABLE_FLEX,
} from "../../../constants/layout.js"
import {
  selectFilteredFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { formatAge, type MetricTotals } from "../../../utils/analysis-format.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import {
  AnalysisChartMetricControls,
  AnalysisDisplayControls,
} from "./AnalysisDisplayControls.js"
import { FileCharts } from "./charts/FileCharts.js"
import { MetricTotalsRow, useMetricColumns } from "./metric-columns.js"

export function FilePanel() {
  const result = useAnalysisStore((s) => s.result)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const authorStats = result?.authorStats ?? []
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const showCommits = useAnalysisStore((s) => s.showCommits)
  const showInsertions = useAnalysisStore((s) => s.showInsertions)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const showLinesOfCode = useAnalysisStore((s) => s.showLinesOfCode)
  const showAge = useAnalysisStore((s) => s.showAge)
  const chartMetric = useAnalysisStore((s) => s.chartMetric)

  const isPercent = displayMode === "percentage"

  const totals = useMemo<MetricTotals>(
    () => ({
      commits: fileStats.reduce((sum, f) => sum + f.commits, 0),
      insertions: fileStats.reduce((sum, f) => sum + f.insertions, 0),
      deletions: fileStats.reduce((sum, f) => sum + f.deletions, 0),
      linesOfCode: fileStats.reduce((sum, f) => sum + f.lines, 0),
    }),
    [fileStats],
  )

  const [sorting, setSorting] = useState<SortingState>([
    { id: "linesOfCode", desc: true },
  ])

  const metricColumns = useMetricColumns<FileStats>({
    totals,
    isPercent,
    showLinesOfCode,
    showCommits,
    showInsertions,
    showDeletions,
  })

  const columns = useMemo<ColumnDef<FileStats>[]>(() => {
    const cols: ColumnDef<FileStats>[] = [
      {
        id: "path",
        accessorFn: (row) => row.path,
        header: ({ column }) => (
          <SortHeaderButton
            label="File"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => (
          <span className="truncate text-xs">{row.original.path}</span>
        ),
      },
      ...metricColumns,
    ]

    if (showAge) {
      cols.push({
        id: "age",
        accessorFn: (row) => -row.lastModified,
        header: ({ column }) => (
          <SortHeaderButton
            label="Age"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) =>
          formatAge(Date.now() / 1000 - row.original.lastModified),
      })
    }

    return cols
  }, [metricColumns, showAge])

  const table = useReactTable({
    data: fileStats,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.path,
  })

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="Run an analysis to see file statistics." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AnalysisDisplayControls showChartMetric={false} />
      <div
        className="min-h-0 overflow-auto"
        style={{ flex: FILES_PANEL_TABLE_FLEX }}
      >
        <DataTable stickyHeader>
          <DataTableHeader>
            {(table.getHeaderGroups()[0]?.headers ?? []).map((header) => (
              <DataTableHead
                key={header.id}
                className={header.id === "path" ? "sticky left-0 z-20" : ""}
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </DataTableHead>
            ))}
          </DataTableHeader>
          <DataTableBody>
            {fileStats.length === 0 ? (
              <DataTableEmptyRow
                colSpan={columns.length}
                message="No file data."
              />
            ) : (
              <>
                <MetricTotalsRow
                  leading={
                    <DataTableCell className="sticky left-0 z-10 bg-background">
                      All files
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
                  <DataTableRow key={row.id} className="group">
                    {row.getVisibleCells().map((cell) => (
                      <DataTableCell
                        key={cell.id}
                        className={
                          cell.column.id === "path"
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
      </div>
      <AnalysisChartMetricControls />
      <div
        className="min-h-0 overflow-auto"
        style={{ flex: FILES_PANEL_CHART_FLEX }}
      >
        <FileCharts
          fileStats={fileStats}
          authorStats={authorStats}
          activeMetric={chartMetric}
        />
      </div>
    </div>
  )
}
