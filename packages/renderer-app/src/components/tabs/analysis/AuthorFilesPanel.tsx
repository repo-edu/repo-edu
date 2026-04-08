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
} from "@repo-edu/ui"
import { ChevronDown, ChevronRight } from "@repo-edu/ui/components/icons"
import { Fragment, useCallback, useMemo, useState } from "react"
import {
  type AnalysisActiveMetric,
  selectAuthorDisplayByPersonId,
  selectFilteredAuthorStats,
  selectFilteredFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { formatCount, formatPercent } from "../../../utils/analysis-format.js"
import { authorColorMap } from "../../../utils/author-colors.js"
import { AnalysisDisplayControls } from "./AnalysisDisplayControls.js"

type AuthorFileRow = {
  path: string
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

function authorFileBreakdown(
  author: AuthorStats,
  fileStats: FileStats[],
): AuthorFileRow[] {
  const key = `${author.canonicalName}\0${author.canonicalEmail}`
  const rows: AuthorFileRow[] = []
  for (const file of fileStats) {
    const breakdown = file.authorBreakdown.get(key)
    if (!breakdown) continue
    rows.push({
      path: file.path,
      commits: breakdown.commits,
      insertions: breakdown.insertions,
      deletions: breakdown.deletions,
      // Exact per-file-per-author line counts arrive in Phase 4 blame output.
      lines: breakdown.insertions - breakdown.deletions,
    })
  }
  return rows
}

export function AuthorFilesPanel() {
  const result = useAnalysisStore((s) => s.result)
  const authorStats = useAnalysisStore(selectFilteredAuthorStats)
  const fileStats = useAnalysisStore(selectFilteredFileStats)
  const activeMetric = useAnalysisStore((s) => s.activeMetric)
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const authorDisplayById = useAnalysisStore(selectAuthorDisplayByPersonId)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const allAuthorIds = useMemo(
    () => (result?.authorStats ?? []).map((a) => a.personId),
    [result],
  )
  const colors = useMemo(() => authorColorMap(allAuthorIds), [allAuthorIds])
  const isPercent = displayMode === "percentage"

  const totals = useMemo<MetricTotals>(
    () => ({
      commits: authorStats.reduce((sum, row) => sum + row.commits, 0),
      insertions: authorStats.reduce((sum, row) => sum + row.insertions, 0),
      deletions: authorStats.reduce((sum, row) => sum + row.deletions, 0),
      linesOfCode: authorStats.reduce((sum, row) => sum + row.lines, 0),
    }),
    [authorStats],
  )

  const metricTotal = totals[activeMetric]

  const toggleExpand = useCallback((personId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) {
        next.delete(personId)
      } else {
        next.add(personId)
      }
      return next
    })
  }, [])

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="Run an analysis to see author-file breakdowns." />
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
              Author / File
            </DataTableHead>
            <DataTableHead>{metricLabel(activeMetric)}</DataTableHead>
            <DataTableHead>Commits</DataTableHead>
            <DataTableHead>Insertions</DataTableHead>
            {showDeletions && <DataTableHead>Deletions</DataTableHead>}
          </DataTableHeader>
          <DataTableBody>
            {authorStats.length === 0 ? (
              <DataTableEmptyRow colSpan={colCount} message="No author data." />
            ) : (
              authorStats
                .map((author) => ({
                  author,
                  value: metricValue(activeMetric, {
                    commits: author.commits,
                    insertions: author.insertions,
                    deletions: author.deletions,
                    lines: author.lines,
                  }),
                }))
                .sort((a, b) => b.value - a.value)
                .map(({ author, value }) => {
                  const isOpen = expanded.has(author.personId)
                  const color = colors.get(author.personId) ?? "#888"
                  const fileRows = isOpen
                    ? authorFileBreakdown(author, fileStats)
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
                    <Fragment key={author.personId}>
                      <DataTableRow
                        className="group cursor-pointer font-medium"
                        onClick={() => toggleExpand(author.personId)}
                      >
                        <DataTableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/50">
                          <div className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="size-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0" />
                            )}
                            <span
                              className="inline-block size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate">
                              {authorDisplayById.get(author.personId)?.name ??
                                author.canonicalName}
                            </span>
                          </div>
                        </DataTableCell>
                        <DataTableCell>
                          {formatMaybePercent(value, metricTotal, isPercent)}
                        </DataTableCell>
                        <DataTableCell>
                          {formatMaybePercent(
                            author.commits,
                            totals.commits,
                            isPercent,
                          )}
                        </DataTableCell>
                        <DataTableCell>
                          {formatMaybePercent(
                            author.insertions,
                            totals.insertions,
                            isPercent,
                          )}
                        </DataTableCell>
                        {showDeletions && (
                          <DataTableCell>
                            {formatMaybePercent(
                              author.deletions,
                              totals.deletions,
                              isPercent,
                            )}
                          </DataTableCell>
                        )}
                      </DataTableRow>
                      {isOpen &&
                        fileRows.map(({ row, metric }) => (
                          <DataTableRow
                            key={`${author.personId}-${row.path}`}
                            className="group bg-muted/30"
                          >
                            <DataTableCell className="sticky left-0 z-10 bg-muted/30 group-hover:bg-muted/50">
                              <span className="pl-8 text-muted-foreground text-xs truncate">
                                {row.path}
                              </span>
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
                        ))}
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
