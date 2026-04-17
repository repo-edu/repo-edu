import { DataTableCell, DataTableRow } from "@repo-edu/ui"
import type { ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { useMemo } from "react"
import {
  formatMaybePercent,
  type MetricTotals,
} from "../../../utils/analysis-format.js"
import { SortHeaderButton } from "../../common/SortHeaderButton.js"

export type MetricRow = {
  commits: number
  insertions: number
  deletions: number
  lines: number
}

export type MetricVisibility = {
  showLinesOfCode: boolean
  showCommits: boolean
  showInsertions: boolean
  showDeletions: boolean
}

type MetricColumnOptions = MetricVisibility & {
  totals: MetricTotals
  isPercent: boolean
}

export function useMetricColumns<T extends MetricRow>({
  totals,
  isPercent,
  showLinesOfCode,
  showCommits,
  showInsertions,
  showDeletions,
}: MetricColumnOptions): ColumnDef<T>[] {
  return useMemo(() => {
    const cols: ColumnDef<T>[] = []
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
        cell: ({ row }) =>
          formatMaybePercent(row.original.lines, totals.linesOfCode, isPercent),
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
        cell: ({ row }) =>
          formatMaybePercent(row.original.commits, totals.commits, isPercent),
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
        cell: ({ row }) =>
          formatMaybePercent(
            row.original.insertions,
            totals.insertions,
            isPercent,
          ),
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
        cell: ({ row }) =>
          formatMaybePercent(
            row.original.deletions,
            totals.deletions,
            isPercent,
          ),
      })
    }
    return cols
  }, [
    totals,
    isPercent,
    showLinesOfCode,
    showCommits,
    showInsertions,
    showDeletions,
  ])
}

type MetricTotalsRowProps = MetricVisibility & {
  totals: MetricTotals
  isPercent: boolean
  leading: ReactNode
  trailing?: ReactNode
}

export function MetricTotalsRow({
  totals,
  isPercent,
  showLinesOfCode,
  showCommits,
  showInsertions,
  showDeletions,
  leading,
  trailing,
}: MetricTotalsRowProps) {
  return (
    <DataTableRow className="font-medium">
      {leading}
      {showLinesOfCode && (
        <DataTableCell>
          {formatMaybePercent(
            totals.linesOfCode,
            totals.linesOfCode,
            isPercent,
          )}
        </DataTableCell>
      )}
      {showCommits && (
        <DataTableCell>
          {formatMaybePercent(totals.commits, totals.commits, isPercent)}
        </DataTableCell>
      )}
      {showInsertions && (
        <DataTableCell>
          {formatMaybePercent(totals.insertions, totals.insertions, isPercent)}
        </DataTableCell>
      )}
      {showDeletions && (
        <DataTableCell>
          {formatMaybePercent(totals.deletions, totals.deletions, isPercent)}
        </DataTableCell>
      )}
      {trailing}
    </DataTableRow>
  )
}
