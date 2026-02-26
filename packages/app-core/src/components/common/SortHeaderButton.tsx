import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
} from "@repo-edu/ui/components/icons"

interface SortableColumn {
  getCanSort: () => boolean
  getIsSorted: () => false | "asc" | "desc"
  toggleSorting: (desc?: boolean) => void
}

export function SortHeaderButton({
  label,
  column,
}: {
  label: string
  column: SortableColumn
}) {
  const sorted = column.getIsSorted()

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:underline"
      onClick={() =>
        column.getCanSort() && column.toggleSorting(sorted === "asc")
      }
    >
      <span>{label}</span>
      {sorted === "asc" ? (
        <ChevronUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      )}
    </button>
  )
}
