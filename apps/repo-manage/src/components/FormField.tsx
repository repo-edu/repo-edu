import {
  cn,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"

interface FormFieldProps {
  label: string
  tooltip?: string
  children: React.ReactNode
  className?: string
}

export function FormField({
  label,
  tooltip,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label size="xs" className="w-28 shrink-0">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="border-b border-dashed border-muted-foreground cursor-help">
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          label
        )}
      </Label>
      {children}
    </div>
  )
}
