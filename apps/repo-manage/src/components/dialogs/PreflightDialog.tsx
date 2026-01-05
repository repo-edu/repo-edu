/**
 * Dialog for showing preflight check results before executing repo operations.
 * Shows collisions (existing repos for create, missing repos for clone/delete).
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import { AlertCircle, Info } from "@repo-edu/ui/components/icons"
import { useOperationStore } from "../../stores/operationStore"
import { useUiStore } from "../../stores/uiStore"

interface PreflightDialogProps {
  /** Callback when user confirms to continue with the operation */
  onContinue?: () => void
}

export function PreflightDialog({ onContinue }: PreflightDialogProps) {
  const open = useUiStore((state) => state.preflightDialogOpen)
  const setOpen = useUiStore((state) => state.setPreflightDialogOpen)
  const preflightResult = useUiStore((state) => state.preflightResult)
  const operationSelected = useOperationStore((state) => state.selected)

  if (!preflightResult) return null

  const { collisions, ready_count } = preflightResult
  const hasCollisions = collisions.length > 0
  const isCreate = operationSelected === "create"

  const title = isCreate
    ? "Repositories Already Exist"
    : operationSelected === "clone"
      ? "Repositories Not Found"
      : "Repositories Not Found"

  const description = isCreate
    ? "The following repositories already exist and will be skipped:"
    : "The following repositories were not found and will be skipped:"

  const handleContinue = () => {
    setOpen(false)
    onContinue?.()
  }

  // If no collisions and nothing ready, show error state
  if (!hasCollisions && ready_count === 0) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-5 text-destructive" />
              No Repositories to Process
            </DialogTitle>
            <DialogDescription>
              {isCreate
                ? "All repositories already exist."
                : "No matching repositories were found."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // If no collisions but has ready repos, no dialog needed (shouldn't be shown)
  if (!hasCollisions) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto py-4">
          <ul className="space-y-1 text-sm">
            {collisions.map((c) => (
              <li key={c.group_id} className="flex gap-2 text-muted-foreground">
                <span className="text-warning">⚠</span>
                <span>
                  {c.repo_name}{" "}
                  <span className="text-muted-foreground/70">
                    ({c.group_name})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 text-sm py-2 px-3 bg-muted rounded-md">
          <Info className="size-4 text-muted-foreground" />
          <span>
            {ready_count} repositor{ready_count !== 1 ? "ies" : "y"} will be{" "}
            {isCreate
              ? "created"
              : operationSelected === "clone"
                ? "cloned"
                : "deleted"}
            .
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            variant={operationSelected === "delete" ? "destructive" : "default"}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
