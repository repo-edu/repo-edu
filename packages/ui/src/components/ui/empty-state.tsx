import type * as React from "react"

import { cn } from "../../lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  /** Message displayed to the user */
  message: string
  /** Optional icon displayed above the message */
  icon?: React.ReactNode
  /** Action buttons or additional content */
  children?: React.ReactNode
}

/**
 * EmptyState displays a centered message with optional icon and action buttons.
 *
 * @example
 * <EmptyState message="No items yet">
 *   <Button>Add Item</Button>
 * </EmptyState>
 *
 * @example
 * <EmptyState
 *   icon={<InboxIcon className="size-8 text-muted-foreground" />}
 *   message="Your inbox is empty"
 * />
 */
function EmptyState({
  message,
  icon,
  children,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-4 text-center",
        className,
      )}
      {...props}
    >
      {icon}
      <p className="text-muted-foreground max-w-md">{message}</p>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
