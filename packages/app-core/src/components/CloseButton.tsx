/**
 * CloseButton - Consistent X close button for dialogs and sheets.
 */

import { Button } from "@repo-edu/ui"
import { X } from "@repo-edu/ui/components/icons"

interface CloseButtonProps {
  onClick: () => void
  title?: string
  className?: string
}

export function CloseButton({
  onClick,
  title = "Close",
  className,
}: CloseButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={className}
      title={title}
    >
      <X className="size-4" />
      <span className="sr-only">{title}</span>
    </Button>
  )
}
