import { Button } from "@repo-edu/ui"
import { Trash2 } from "@repo-edu/ui/components/icons"

interface ActionCellProps {
  onDelete: () => void
}

export function ActionCell({ onDelete }: ActionCellProps) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onDelete}
      className="h-7 w-7 p-0"
      title="Remove student"
    >
      <Trash2 className="size-4 hover:text-destructive" />
    </Button>
  )
}
