import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { MdiLockOpenVariantOutline } from "./icons/MdiLockOpenVariantOutline"
import { MdiLockOutline } from "./icons/MdiLockOutline"

interface SectionProps {
  title: string
  children: React.ReactNode
  className?: string
  locked?: boolean
  lockTooltip?: string
  onToggleLock?: () => void
  action?: React.ReactNode
}

export function Section({
  title,
  children,
  className,
  locked,
  lockTooltip,
  onToggleLock,
  action,
}: SectionProps) {
  return (
    <Card size="compact" className={className}>
      <CardHeader size="compact">
        <div className="flex items-center justify-between gap-2">
          <CardTitle size="compact" className="flex items-center gap-2">
            <span>{title}</span>
            {onToggleLock && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={onToggleLock}
                  >
                    {locked ? (
                      <MdiLockOutline
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
                    ) : (
                      <MdiLockOpenVariantOutline
                        className="h-3.5 w-3.5 text-sky-600"
                        aria-hidden
                      />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {locked ? lockTooltip || "Click to unlock" : "Click to lock"}
                </TooltipContent>
              </Tooltip>
            )}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent size="compact" className="space-y-1.5">
        {children}
      </CardContent>
    </Card>
  )
}
