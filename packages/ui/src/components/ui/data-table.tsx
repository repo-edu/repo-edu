import type * as React from "react"

import { cn } from "../../lib/utils"

/**
 * DataTable - A styled table wrapper with border and rounded corners.
 * Use with DataTableHeader, DataTableBody, DataTableRow, DataTableHead, and DataTableCell.
 *
 * @example
 * <DataTable>
 *   <DataTableHeader>
 *     <DataTableHead>Name</DataTableHead>
 *     <DataTableHead>Email</DataTableHead>
 *   </DataTableHeader>
 *   <DataTableBody>
 *     {items.map(item => (
 *       <DataTableRow key={item.id}>
 *         <DataTableCell>{item.name}</DataTableCell>
 *         <DataTableCell>{item.email}</DataTableCell>
 *       </DataTableRow>
 *     ))}
 *   </DataTableBody>
 * </DataTable>
 */

interface DataTableProps extends React.ComponentProps<"div"> {
  /** Whether the table header should stick when scrolling */
  stickyHeader?: boolean
}

function DataTable({
  className,
  children,
  stickyHeader = false,
  ...props
}: DataTableProps) {
  return (
    <div
      data-slot="data-table"
      data-sticky-header={stickyHeader || undefined}
      className={cn(
        "border rounded",
        stickyHeader && "overflow-auto",
        className,
      )}
      {...props}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

function DataTableHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="data-table-header"
      className={cn(
        "bg-muted",
        // When parent has data-sticky-header, make header sticky
        "[[data-sticky-header]_&]:sticky [[data-sticky-header]_&]:top-0",
        className,
      )}
      {...props}
    >
      <tr>{children}</tr>
    </thead>
  )
}

function DataTableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody data-slot="data-table-body" className={cn(className)} {...props} />
  )
}

function DataTableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="data-table-row"
      className={cn("border-t hover:bg-muted/50", className)}
      {...props}
    />
  )
}

function DataTableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="data-table-head"
      className={cn("text-left p-2 font-medium", className)}
      {...props}
    />
  )
}

function DataTableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="data-table-cell"
      className={cn("p-2", className)}
      {...props}
    />
  )
}

interface DataTableEmptyRowProps extends React.ComponentProps<"tr"> {
  /** Number of columns to span */
  colSpan: number
  /** Message to display */
  message: string
}

function DataTableEmptyRow({
  colSpan,
  message,
  className,
  ...props
}: DataTableEmptyRowProps) {
  return (
    <tr data-slot="data-table-empty-row" className={cn(className)} {...props}>
      <td colSpan={colSpan} className="p-4 text-center text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}

export {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
}
