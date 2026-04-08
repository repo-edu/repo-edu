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
import { ChevronDown, ChevronRight } from "@repo-edu/ui/components/icons"
import { Fragment, useCallback, useMemo, useState } from "react"
import {
  type AnalysisActiveMetric,
  selectFilteredFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { formatCount, formatPercent } from "../../../utils/analysis-format.js"
import { authorColorMap } from "../../../utils/author-colors.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"

type FileAuthorRow = {
  authorKey: string
  name: string
  commits: number
  insertions: number
  deletions: number
  lines: number
}

type MetricTotals = {
  commits: number
  insertions: number
  deletions: number
  linesOfCode: number
}

function metricLabel(metric: AnalysisActiveMetric): string {
  switch (metric) {
    case "commits":
      return "Commits"
    case "insertions":
      return "Insertions"
    case "deletions":
      return "Deletions"
    case "linesOfCode":
      return "Lines"
  }
}

function metricValue(
  metric: AnalysisActiveMetric,
  values: {
    commits: number
    insertions: number
    deletions: number
    lines: number
  },
): number {
  switch (metric) {
    case "commits":
      return values.commits
    case "insertions":
      return values.insertions
    case "deletions":
      return values.deletions
    case "linesOfCode":
      return values.lines
  }
}

function formatMaybePercent(
  value: number,
  total: number,
  isPercent: boolean,
): string {
  if (!isPercent) {
    return formatCount(value)
  }
  if (total <= 0) {
    return "0.0%"
  }
  return formatPercent((100 * value) / total)
}

function fileAuthorBreakdown(file: FileStats): FileAuthorRow[] {
  const rows: FileAuthorRow[] = []
  for (const [key, breakdown] of file.authorBreakdown) {
    const name = key.split("\0")[0] ?? key
    rows.push({
      authorKey: key,
      name,
      commits: breakdown.commits,
      insertions: breakdown.insertions,
      deletions: breakdown.deletions,
      // Exact per-file-per-author line counts arrive in Phase 4 blame output.
      lines: breakdown.insertions - breakdown.deletions,
    })
  }
  return rows
}

export function FileAuthorsPanel() {
  const result = useAnalysisStore((s) => s.result)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const activeMetric = useAnalysisStore((s) => s.activeMetric)
  const displayMode = useAnalysisStore((s) => s.displayMode)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const allAuthorIds = useMemo(() => {
    const stats = result?.authorStats
    return stats ? stats.map((a) => a.personId) : []
  }, [result])
  const colors = useMemo(() => authorColorMap(allAuthorIds), [allAuthorIds])

  const authorKeyToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of result?.authorStats ?? []) {
      map.set(`${a.canonicalName}\0${a.canonicalEmail}`, a.personId)
    }
    return map
  }, [result])

  const totals = useMemo<MetricTotals>(
    () => ({
      commits: fileStats.reduce((sum, row) => sum + row.commits, 0),
      insertions: fileStats.reduce((sum, row) => sum + row.insertions, 0),
      deletions: fileStats.reduce((sum, row) => sum + row.deletions, 0),
      linesOfCode: fileStats.reduce((sum, row) => sum + row.lines, 0),
    }),
    [fileStats],
  )
  const metricTotal = totals[activeMetric]
  const isPercent = displayMode === "percentage"

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="Run an analysis to see file-author breakdowns." />
      </div>
    )
  }

  const colCount = 4 + (showDeletions ? 1 : 0)

  return (
    <div className="flex flex-col h-full min-h-0">
      <AnalysisDisplayControls />
      <div className="flex-1 min-h-0 overflow-auto">
        <DataTable stickyHeader>
          <DataTableHeader>
            <DataTableHead className="sticky left-0 z-20">
              File / Author
            </DataTableHead>
            <DataTableHead>{metricLabel(activeMetric)}</DataTableHead>
            <DataTableHead>Commits</DataTableHead>
            <DataTableHead>Insertions</DataTableHead>
            {showDeletions && <DataTableHead>Deletions</DataTableHead>}
          </DataTableHeader>
          <DataTableBody>
            {fileStats.length === 0 ? (
              <DataTableEmptyRow colSpan={colCount} message="No file data." />
            ) : (
              fileStats
                .map((file) => ({
                  file,
                  value: metricValue(activeMetric, {
                    commits: file.commits,
                    insertions: file.insertions,
                    deletions: file.deletions,
                    lines: file.lines,
                  }),
                }))
                .sort((a, b) => b.value - a.value)
                .map(({ file, value }) => {
                  const isOpen = expanded.has(file.path)
                  const authorRows = isOpen
                    ? fileAuthorBreakdown(file)
                        .map((row) => ({
                          row,
                          metric: metricValue(activeMetric, {
                            commits: row.commits,
                            insertions: row.insertions,
                            deletions: row.deletions,
                            lines: row.lines,
                          }),
                        }))
                        .sort((a, b) => b.metric - a.metric)
                    : []

                  return (
                    <Fragment key={file.path}>
                      <DataTableRow
                        className="group cursor-pointer font-medium"
                        onClick={() => toggleExpand(file.path)}
                      >
                        <DataTableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/50">
                          <div className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="size-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0" />
                            )}
                            <span className="truncate text-xs">
                              {file.path}
                            </span>
                          </div>
                        </DataTableCell>
                        <DataTableCell>
                          {formatMaybePercent(value, metricTotal, isPercent)}
                        </DataTableCell>
                        <DataTableCell>
                          {formatMaybePercent(
                            file.commits,
                            totals.commits,
                            isPercent,
                          )}
                        </DataTableCell>
                        <DataTableCell>
                          {formatMaybePercent(
                            file.insertions,
                            totals.insertions,
                            isPercent,
                          )}
                        </DataTableCell>
                        {showDeletions && (
                          <DataTableCell>
                            {formatMaybePercent(
                              file.deletions,
                              totals.deletions,
                              isPercent,
                            )}
                          </DataTableCell>
                        )}
                      </DataTableRow>
                      {isOpen &&
                        authorRows.map(({ row, metric }) => {
                          const personId =
                            authorKeyToId.get(row.authorKey) ?? ""
                          const color = colors.get(personId) ?? "#888"
                          return (
                            <DataTableRow
                              key={`${file.path}-${row.authorKey}`}
                              className="group bg-muted/30"
                            >
                              <DataTableCell className="sticky left-0 z-10 bg-muted/30 group-hover:bg-muted/50">
                                <div className="flex items-center gap-1.5 pl-8">
                                  <span
                                    className="inline-block size-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="text-muted-foreground text-xs">
                                    {row.name}
                                  </span>
                                </div>
                              </DataTableCell>
                              <DataTableCell>
                                {formatMaybePercent(
                                  metric,
                                  metricTotal,
                                  isPercent,
                                )}
                              </DataTableCell>
                              <DataTableCell>
                                {formatMaybePercent(
                                  row.commits,
                                  totals.commits,
                                  isPercent,
                                )}
                              </DataTableCell>
                              <DataTableCell>
                                {formatMaybePercent(
                                  row.insertions,
                                  totals.insertions,
                                  isPercent,
                                )}
                              </DataTableCell>
                              {showDeletions && (
                                <DataTableCell>
                                  {formatMaybePercent(
                                    row.deletions,
                                    totals.deletions,
                                    isPercent,
                                  )}
                                </DataTableCell>
                              )}
                            </DataTableRow>
                          )
                        })}
                    </Fragment>
                  )
                })
            )}
          </DataTableBody>
        </DataTable>
      </div>
    </div>
  )
}
