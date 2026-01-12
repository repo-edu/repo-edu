import { Card, CardContent } from "@repo-edu/ui"
import { forwardRef } from "react"

interface ActionBarProps {
  children: React.ReactNode
  right?: React.ReactNode
  className?: string
}

export const ActionBar = forwardRef<HTMLDivElement, ActionBarProps>(
  ({ children, right, className }, ref) => (
    <Card ref={ref} size="compact" className={`shrink-0 ${className ?? ""}`}>
      <CardContent size="compact" className="flex gap-2 items-center py-1.5">
        <div className="flex gap-2 items-center">{children}</div>
        {right && <div className="ml-auto">{right}</div>}
      </CardContent>
    </Card>
  ),
)

ActionBar.displayName = "ActionBar"
