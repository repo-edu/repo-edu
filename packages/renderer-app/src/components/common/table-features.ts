import {
  type ColumnDef,
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  type RowData,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table"

export const sortedTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

export type SortedColumnDef<T extends RowData> = ColumnDef<
  typeof sortedTableFeatures,
  T
>

export const rosterTableFeatures = tableFeatures({
  ...sortedTableFeatures,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
})

export type RosterColumnDef<T extends RowData> = ColumnDef<
  typeof rosterTableFeatures,
  T
>
