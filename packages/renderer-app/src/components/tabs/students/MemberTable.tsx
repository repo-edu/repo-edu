import type { RosterMember } from "@repo-edu/domain/types"
import { flexRender, type Table } from "@tanstack/react-table"

export function MemberTable({
  table,
  globalFilter,
}: {
  table: Table<RosterMember>
  globalFilter: string
}) {
  const totalColumnSize = table.getTotalSize()
  const toColumnWidth = (size: number): string | undefined =>
    totalColumnSize > 0 ? `${(size / totalColumnSize) * 100}%` : undefined

  return (
    <div className="px-3 pb-2">
      <div className="border rounded">
        <table
          className={`w-full text-sm ${table.getState().columnSizingInfo.isResizingColumn ? "select-none" : ""}`}
          style={{ tableLayout: "fixed" }}
        >
          <thead className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="bg-muted sticky top-0 z-10 p-2 text-left font-medium relative min-w-0"
                    style={{ width: toColumnWidth(header.getSize()) }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {header.column.getCanResize() && (
                      // biome-ignore lint/a11y/noStaticElementInteractions: column resize handle uses mouse/touch drag, not keyboard interaction
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-px cursor-col-resize select-none touch-none bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 ${
                          header.column.getIsResizing() ? "bg-primary" : ""
                        }`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t hover:bg-muted/50 ${
                  row.original.status !== "active" ? "opacity-40" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="p-2 align-middle min-w-0"
                    style={{ width: toColumnWidth(cell.column.getSize()) }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="p-4 text-center text-muted-foreground"
                >
                  {globalFilter
                    ? "No roster members match search"
                    : "No roster members"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
