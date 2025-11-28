import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@repo-edu/ui";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  locked?: boolean;
  lockTooltip?: string;
  action?: React.ReactNode;
}

export function Section({ title, children, className, locked, lockTooltip, action }: SectionProps) {
  return (
    <Card size="compact" className={className}>
      <CardHeader size="compact">
        <div className="flex items-center justify-between gap-2">
          <CardTitle size="compact" className="flex items-center gap-2">
            <span>{title}</span>
            {locked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] px-2 py-[2px] rounded-full bg-muted text-muted-foreground cursor-help">
                    Locked
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {lockTooltip || "Locked"}
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
  );
}
