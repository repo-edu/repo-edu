import type { SortDirection } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "@repo-edu/ui/components/icons";

type SortHeaderButtonProps = {
  label: string;
  canSort: boolean;
  sorted: false | SortDirection;
  onToggle: () => void;
};

export function SortHeaderButton({
  label,
  canSort,
  sorted,
  onToggle,
}: SortHeaderButtonProps) {
  if (!canSort) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left font-medium hover:underline"
      onClick={onToggle}
    >
      {label}
      {sorted === "asc" ? (
        <ChevronUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <ChevronsUpDown className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}
