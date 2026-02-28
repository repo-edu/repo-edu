import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
} from "@repo-edu/ui/components/icons"

interface SortHeaderButtonProps {
  label: string
  canSort: boolean
  sorted: false | "asc" | "desc"
  onToggle: () => void
}

export function SortHeaderButton({
  label,
  canSort,
  sorted,
  onToggle,
}: SortHeaderButtonProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:underline"
      aria-disabled={!canSort}
      onClick={() => canSort && onToggle()}
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
