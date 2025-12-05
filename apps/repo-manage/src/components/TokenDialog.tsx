import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@repo-edu/ui"

interface TokenDialogProps {
  open: boolean
  title: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  instructions?: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
}

export function TokenDialog({
  open,
  title,
  value,
  onChange,
  onClose,
  onSave,
  instructions,
  children,
  actions,
}: TokenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="compact" className="max-w-md">
        <DialogHeader size="compact">
          <DialogTitle size="compact">{title}</DialogTitle>
        </DialogHeader>
        {children ?? (
          <>
            <Input
              size="xs"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Paste your access token"
            />
            {instructions && (
              <Collapsible>
                <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
                  ▶ How to get a token
                </CollapsibleTrigger>
                <CollapsibleContent className="text-xs text-muted-foreground mt-2 pl-4">
                  {instructions}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex gap-2 items-center">{actions}</div>
          <div className="flex gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button size="xs" onClick={onSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
