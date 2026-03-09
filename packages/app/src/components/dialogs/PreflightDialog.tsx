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
import { useOperationStore } from "../../stores/operation-store.js"
import { useUiStore } from "../../stores/ui-store.js"

type PreflightDialogProps = {
  onContinue?: () => void
}

export function PreflightDialog({ onContinue }: PreflightDialogProps) {
  const open = useUiStore((state) => state.preflightDialogOpen)
  const setOpen = useUiStore((state) => state.setPreflightDialogOpen)
  const preflightResult = useOperationStore((state) => state.preflightResult)
  const operationSelected = useOperationStore((state) => state.selected)

  if (!preflightResult) return null

  const { collisions, readyCount } = preflightResult
  const hasCollisions = collisions.length > 0
  const isCreate = operationSelected === "create"

  const title = isCreate
    ? "Repositories Already Exist"
    : "Repositories Not Found"

  const description = isCreate
    ? "The following repositories already exist and will be skipped:"
    : "The following repositories were not found and will be skipped:"

  const handleContinue = () => {
    setOpen(false)
    onContinue?.()
  }

  if (!hasCollisions && readyCount === 0) {
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

  if (!hasCollisions) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto py-2">
          <ul className="space-y-1.5 text-sm">
            {collisions.map((collision) => (
              <li
                key={`${collision.groupId}:${collision.repoName}`}
                className="flex gap-2"
              >
                <span className="text-warning">⚠</span>
                <span>
                  {collision.repoName}{" "}
                  <span className="text-muted-foreground">
                    ({collision.groupName})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-muted">
          <Info className="size-4" />
          <span>
            {readyCount} repositor{readyCount === 1 ? "y" : "ies"} will be{" "}
            {operationSelected === "create"
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
