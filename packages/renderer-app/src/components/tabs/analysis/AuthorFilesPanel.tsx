import type { AuthorStats, FileStats } from "@repo-edu/domain/analysis"
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
} from "@repo-edu/ui"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useCallback, useMemo, useState } from "react"
import {
  ANALYSIS_DETAIL_LIST_DEFAULT_WIDTH_PX,
  ANALYSIS_DETAIL_LIST_MAX_WIDTH_PX,
  ANALYSIS_DETAIL_LIST_MIN_WIDTH_PX,
  RESIZE_DEBOUNCE_MS,
} from "../../../constants/layout.js"
import {
  selectAuthorDisplayByPersonId,
  selectFilteredAuthorStats,
  selectFilteredFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import {
  formatAge,
  formatCount,
  type MetricTotals,
} from "../../../utils/analysis-format.js"
import { authorColorMap } from "../../../utils/author-colors.js"
import { debounceAsync } from "../../../utils/debounce.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"
import { MetricTotalsRow, useMetricColumns } from "./metric-columns.js"

type AuthorFileRow = {
  path: string
  commits: number
  insertions: number
  deletions: number
  lines: number
  lastModified: number
}

function authorFileBreakdown(
  author: AuthorStats,
  fileStats: FileStats[],
): AuthorFileRow[] {
  const rows: AuthorFileRow[] = []
  for (const file of fileStats) {
    const breakdown = file.authorBreakdown.get(author.personId)
    if (!breakdown) continue
    rows.push({
      path: file.path,
      commits: breakdown.commits,
      insertions: breakdown.insertions,
      deletions: breakdown.deletions,
      lines: breakdown.insertions - breakdown.deletions,
      lastModified: file.lastModified,
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

export function AuthorFilesPanel() {
  const result = useAnalysisStore((s) => s.result)
  const authorStats = useAnalysisStore(selectFilteredAuthorStats)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const showCommits = useAnalysisStore((s) => s.showCommits)
  const showInsertions = useAnalysisStore((s) => s.showInsertions)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const showLinesOfCode = useAnalysisStore((s) => s.showLinesOfCode)
  const showAge = useAnalysisStore((s) => s.showAge)
  const authorDisplayById = useAnalysisStore(selectAuthorDisplayByPersonId)

  const listSize = useAppSettingsStore((s) => s.settings.analysisDetailListSize)
  const setListSize = useAppSettingsStore((s) => s.setAnalysisDetailListSize)
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const listWidthPx = clampListWidth(listSize)
  const saveDebounced = useMemo(
    () => debounceAsync(saveAppSettings, RESIZE_DEBOUNCE_MS),
    [saveAppSettings],
  )

  const allAuthorIds = useMemo(
    () => (result?.authorStats ?? []).map((a) => a.personId),
    [result],
  )
  const colors = useMemo(() => authorColorMap(allAuthorIds), [allAuthorIds])

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const effectiveSelectedId =
    selectedPersonId && authorStats.some((a) => a.personId === selectedPersonId)
      ? selectedPersonId
      : (authorStats[0]?.personId ?? null)

  const selectedAuthor = useMemo(
    () => authorStats.find((a) => a.personId === effectiveSelectedId) ?? null,
    [authorStats, effectiveSelectedId],
  )

  const breakdownRows = useMemo(
    () =>
      selectedAuthor ? authorFileBreakdown(selectedAuthor, fileStats) : [],
    [selectedAuthor, fileStats],
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

  const metricColumns = useMetricColumns<AuthorFileRow>({
    totals,
    isPercent,
    showLinesOfCode,
    showCommits,
    showInsertions,
    showDeletions,
  })

  const columns = useMemo<ColumnDef<AuthorFileRow>[]>(() => {
    const cols: ColumnDef<AuthorFileRow>[] = [
      {
        id: "file",
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
    data: breakdownRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.path,
  })

  const handleListResize = useCallback(
    (
      panelSize: { inPixels: number },
      _id: string | number | undefined,
      previousPanelSize: { inPixels: number } | undefined,
    ) => {
      if (!previousPanelSize) return
      setListSize(clampListWidth(panelSize.inPixels))
      saveDebounced()
    },
    [saveDebounced, setListSize],
  )

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="Run an analysis to see author-file breakdowns." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AnalysisDisplayControls showChartMetric={false} />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="author-files-list"
            defaultSize={`${listWidthPx}px`}
            minSize={`${ANALYSIS_DETAIL_LIST_MIN_WIDTH_PX}px`}
            maxSize={`${ANALYSIS_DETAIL_LIST_MAX_WIDTH_PX}px`}
            groupResizeBehavior="preserve-pixel-size"
            onResize={handleListResize}
            className="min-w-0"
          >
            <div className="h-full overflow-y-auto border-r">
              {authorStats.map((author) => {
                const color = colors.get(author.personId) ?? "#888"
                const isSelected = author.personId === effectiveSelectedId
                return (
                  <button
                    key={author.personId}
                    type="button"
                    className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm ${isSelected ? "bg-selection font-medium" : "hover:bg-accent"}`}
                    onClick={() => setSelectedPersonId(author.personId)}
                  >
                    <span
                      className="inline-block size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate min-w-0 flex-1">
                      {authorDisplayById.get(author.personId)?.name ??
                        author.canonicalName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatCount(author.lines)}
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
                        header.id === "file" ? "sticky left-0 z-20" : ""
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
                      message="No file data for this author."
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
                                cell.column.id === "file"
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
