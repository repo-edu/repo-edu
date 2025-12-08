import { Card, CardContent, CardHeader, CardTitle } from "@repo-edu/ui"
import { useState } from "react"
import { MdiChevronDown } from "./icons/MdiChevronDown"
import { MdiChevronRight } from "./icons/MdiChevronRight"

interface SectionProps {
  title: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
  defaultCollapsed?: boolean
}

export function Section({
  title,
  children,
  className,
  action,
  defaultCollapsed = false,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <Card size="compact" className={className}>
      <CardHeader
        size="compact"
        className="cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle size="compact" className="flex items-center gap-2">
            {collapsed ? (
              <MdiChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <MdiChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span>{title}</span>
          </CardTitle>
          <div onClick={(e) => e.stopPropagation()}>{action}</div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent size="compact" className="space-y-1.5">
          {children}
        </CardContent>
      )}
    </Card>
  )
}
