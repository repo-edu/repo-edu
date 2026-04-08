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
import {
  formatCount,
  formatPercent,
  formatRelativeTime,
} from "../../../utils/analysis-format.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"
import { FileFilterControls } from "./FileFilterControls.js"
import { FileCharts } from "./charts/FileCharts.js"

export function FilePanel() {
  const result = useAnalysisStore((s) => s.result)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const authorStats = result?.authorStats ?? []
  const activeMetric = useAnalysisStore((s) => s.activeMetric)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const blameTargetFiles = useAnalysisStore((s) => s.blameTargetFiles)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)

  const [sorting, setSorting] = useState<SortingState>([
    { id: "lines", desc: true },
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
      },
    ]

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

    cols.push(
      {
        id: "lines",
        accessorFn: (row) => row.lines,
        header: ({ column }) => (
          <SortHeaderButton
            label="Lines"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatCount(row.original.lines),
      },
      {
        id: "stability",
        accessorFn: (row) => row.stability,
        header: ({ column }) => (
          <SortHeaderButton
            label="Stability"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => formatPercent(row.original.stability),
      },
      {
        id: "lastModified",
        accessorFn: (row) => row.lastModified,
        header: ({ column }) => (
          <SortHeaderButton
            label="Last Modified"
            canSort={column.getCanSort()}
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(row.original.lastModified)}
          </span>
        ),
      },
    )

    return cols
  }, [showDeletions])

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
            {table.getHeaderGroups()[0].headers.map((header) => (
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
                    blameTargetFiles.includes(row.original.path)
                      ? "bg-primary/5"
                      : ""
                  }`}
                  onClick={() => openFileForBlame(row.original.path)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <DataTableCell
                      key={cell.id}
                      className={
                        cell.column.id === "path"
                          ? `sticky left-0 z-10 ${
                              blameTargetFiles.includes(row.original.path)
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
          activeMetric={activeMetric}
        />
      </div>
      <FileFilterControls />
    </div>
  )
}
