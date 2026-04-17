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
  selectFilteredFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { formatAge, formatCount } from "../../../utils/analysis-format.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"
import { FileCharts } from "./charts/FileCharts.js"
import { FileFilterControls } from "./FileFilterControls.js"

export function FilePanel() {
  const result = useAnalysisStore((s) => s.result)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const authorStats = result?.authorStats ?? []
  const showCommits = useAnalysisStore((s) => s.showCommits)
  const showInsertions = useAnalysisStore((s) => s.showInsertions)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const showLinesOfCode = useAnalysisStore((s) => s.showLinesOfCode)
  const showAge = useAnalysisStore((s) => s.showAge)
  const chartMetric = useAnalysisStore((s) => s.chartMetric)
  const activeBlameFile = useAnalysisStore((s) => s.activeBlameFile)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)

  const [sorting, setSorting] = useState<SortingState>([
    { id: "linesOfCode", desc: true },
  ])

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
    ]

    if (showLinesOfCode) {
      cols.push({
        id: "linesOfCode",
        accessorFn: (row) => row.lines,
        header: ({ column }) => (
          <SortHeaderButton
            label="Lines of Code"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatCount(row.original.lines),
      })
    }

    if (showCommits) {
      cols.push({
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
      })
    }

    if (showInsertions) {
      cols.push({
        id: "insertions",
        accessorFn: (row) => row.insertions,
        header: ({ column }) => (
          <SortHeaderButton
            label="Insertions"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatCount(row.original.insertions),
      })
    }

    if (showDeletions) {
      cols.push({
        id: "deletions",
        accessorFn: (row) => row.deletions,
        header: ({ column }) => (
          <SortHeaderButton
            label="Deletions"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatCount(row.original.deletions),
      })
    }

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
  }, [showAge, showCommits, showInsertions, showDeletions, showLinesOfCode])

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
      <AnalysisDisplayControls />
      <div className="flex-1 min-h-0 overflow-auto">
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
            {table.getRowModel().rows.length === 0 ? (
              <DataTableEmptyRow
                colSpan={columns.length}
                message="No file data."
              />
            ) : (
              table.getRowModel().rows.map((row) => (
                <DataTableRow
                  key={row.id}
                  className={`group cursor-pointer ${
                    activeBlameFile === row.original.path ? "bg-primary/5" : ""
                  }`}
                  onClick={() => openFileForBlame(row.original.path)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <DataTableCell
                      key={cell.id}
                      className={
                        cell.column.id === "path"
                          ? `sticky left-0 z-10 ${
                              activeBlameFile === row.original.path
                                ? "bg-primary/5"
                                : "bg-background group-hover:bg-muted/50"
                            }`
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
        <FileCharts
          fileStats={fileStats}
          authorStats={authorStats}
          activeMetric={chartMetric}
        />
      </div>
      <FileFilterControls />
    </div>
  )
}
