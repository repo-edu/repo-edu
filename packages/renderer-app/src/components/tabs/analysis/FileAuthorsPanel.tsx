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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
} from "@repo-edu/ui"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  ANALYSIS_DETAIL_LIST_DEFAULT_WIDTH_PX,
  ANALYSIS_DETAIL_LIST_MAX_WIDTH_PX,
  ANALYSIS_DETAIL_LIST_MIN_WIDTH_PX,
} from "../../../constants/layout.js"
import {
  selectAuthorColorsByPersonId,
  selectAuthorDisplayByPersonId,
  selectFilteredFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import {
  formatAge,
  formatCount,
  type MetricTotals,
} from "../../../utils/analysis-format.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"
import { MetricTotalsRow, useMetricColumns } from "./metric-columns.js"

type FileAuthorRow = {
  personId: string
  name: string
  commits: number
  insertions: number
  deletions: number
  lines: number
  age: number
}

function fileAuthorBreakdown(
  file: FileStats,
  personIdToName: Map<string, string>,
  personIdToAge: Map<string, number>,
): FileAuthorRow[] {
  const rows: FileAuthorRow[] = []
  for (const [personId, breakdown] of file.authorBreakdown) {
    rows.push({
      personId,
      name: personIdToName.get(personId) ?? personId,
      commits: breakdown.commits,
      insertions: breakdown.insertions,
      deletions: breakdown.deletions,
      lines: breakdown.lines,
      age: personIdToAge.get(personId) ?? 0,
    })
  }
  return rows
}

function clampListWidth(size: number | null | undefined): number {
  const value = size ?? ANALYSIS_DETAIL_LIST_DEFAULT_WIDTH_PX
  return Math.min(
    ANALYSIS_DETAIL_LIST_MAX_WIDTH_PX,
    Math.max(ANALYSIS_DETAIL_LIST_MIN_WIDTH_PX, value),
  )
}

export function FileAuthorsPanel() {
  const result = useAnalysisStore((s) => s.result)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const showCommits = useAnalysisStore((s) => s.showCommits)
  const showInsertions = useAnalysisStore((s) => s.showInsertions)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const showLinesOfCode = useAnalysisStore((s) => s.showLinesOfCode)
  const showAge = useAnalysisStore((s) => s.showAge)
  const colors = useAnalysisStore(selectAuthorColorsByPersonId)

  const initialListWidthPxRef = useRef(
    clampListWidth(
      useAppSettingsStore.getState().settings.analysisDetailListSize,
    ),
  )
  const listPanelRef = useRef<ResizablePanelHandle | null>(null)

  const authorDisplayById = useAnalysisStore(selectAuthorDisplayByPersonId)

  const personIdToName = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of result?.authorStats ?? []) {
      map.set(
        a.personId,
        authorDisplayById.get(a.personId)?.name ?? a.canonicalName,
      )
    }
    return map
  }, [result, authorDisplayById])

  const personIdToAge = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of result?.authorStats ?? []) {
      map.set(a.personId, a.age)
    }
    return map
  }, [result])

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const effectiveSelectedPath =
    selectedPath && fileStats.some((f) => f.path === selectedPath)
      ? selectedPath
      : (fileStats[0]?.path ?? null)

  const selectedFile = useMemo(
    () => fileStats.find((f) => f.path === effectiveSelectedPath) ?? null,
    [fileStats, effectiveSelectedPath],
  )

  const breakdownRows = useMemo(
    () =>
      selectedFile
        ? fileAuthorBreakdown(selectedFile, personIdToName, personIdToAge)
        : [],
    [selectedFile, personIdToName, personIdToAge],
  )

  const isPercent = displayMode === "percentage"

  const totals = useMemo<MetricTotals>(
    () => ({
      commits: breakdownRows.reduce((sum, r) => sum + r.commits, 0),
      insertions: breakdownRows.reduce((sum, r) => sum + r.insertions, 0),
      deletions: breakdownRows.reduce((sum, r) => sum + r.deletions, 0),
      linesOfCode: breakdownRows.reduce((sum, r) => sum + r.lines, 0),
    }),
    [breakdownRows],
  )

  const [sorting, setSorting] = useState<SortingState>([
    { id: "linesOfCode", desc: true },
  ])

  const metricColumns = useMetricColumns<FileAuthorRow>({
    totals,
    isPercent,
    showLinesOfCode,
    showCommits,
    showInsertions,
    showDeletions,
  })

  const columns = useMemo<ColumnDef<FileAuthorRow>[]>(() => {
    const cols: ColumnDef<FileAuthorRow>[] = [
      {
        id: "author",
        accessorFn: (row) => row.name,
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
          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="inline-block size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">{row.original.name}</span>
            </div>
          )
        },
      },
      ...metricColumns,
    ]
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
  }, [colors, metricColumns, showAge])

  const table = useReactTable({
    data: breakdownRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.personId,
  })

  const handleLayoutChanged = useCallback(() => {
    const panel = listPanelRef.current
    if (!panel) return
    const { setAnalysisDetailListSize, save } = useAppSettingsStore.getState()
    setAnalysisDetailListSize(clampListWidth(panel.getSize().inPixels))
    void save()
  }, [])

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="Run an analysis to see file-author breakdowns." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AnalysisDisplayControls showChartMetric={false} />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full"
          onLayoutChanged={handleLayoutChanged}
        >
          <ResizablePanel
            id="file-authors-list"
            panelRef={listPanelRef}
            defaultSize={`${initialListWidthPxRef.current}px`}
            minSize={`${ANALYSIS_DETAIL_LIST_MIN_WIDTH_PX}px`}
            maxSize={`${ANALYSIS_DETAIL_LIST_MAX_WIDTH_PX}px`}
            groupResizeBehavior="preserve-pixel-size"
            className="min-w-0"
          >
            <div className="h-full overflow-y-auto border-r">
              {fileStats.map((file) => {
                const isSelected = file.path === effectiveSelectedPath
                return (
                  <button
                    key={file.path}
                    type="button"
                    className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm ${isSelected ? "bg-selection font-medium" : "hover:bg-accent"}`}
                    onClick={() => setSelectedPath(file.path)}
                  >
                    <span className="truncate min-w-0 flex-1 text-xs">
                      {file.path}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatCount(file.lines)}
                    </span>
                  </button>
                )
              })}
            </div>
          </ResizablePanel>
          <ResizableHandle className="aria-[orientation=vertical]:w-px aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1 aria-[orientation=vertical]:after:w-2" />
          <ResizablePanel className="min-w-0">
            <div className="h-full overflow-auto">
              <DataTable stickyHeader>
                <DataTableHeader>
                  {(table.getHeaderGroups()[0]?.headers ?? []).map((header) => (
                    <DataTableHead
                      key={header.id}
                      className={
                        header.id === "author" ? "sticky left-0 z-20" : ""
                      }
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </DataTableHead>
                  ))}
                </DataTableHeader>
                <DataTableBody>
                  {breakdownRows.length === 0 ? (
                    <DataTableEmptyRow
                      colSpan={columns.length}
                      message="No author data for this file."
                    />
                  ) : (
                    <>
                      <MetricTotalsRow
                        leading={
                          <DataTableCell className="sticky left-0 z-10 bg-background">
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
                        <DataTableRow key={row.id} className="group">
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
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
