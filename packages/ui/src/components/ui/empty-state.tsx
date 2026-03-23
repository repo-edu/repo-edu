import type * as React from "react"

import { cn } from "../../lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  message: string
  icon?: React.ReactNode
  children?: React.ReactNode
}

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

export type { EmptyStateProps }
export { EmptyState }
