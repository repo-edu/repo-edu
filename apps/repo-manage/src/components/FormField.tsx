import {
  cn,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { MdiInformationOutline } from "./icons/MdiInformationOutline"

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
          <span className="inline-flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
                >
                  <MdiInformationOutline className="size-3.5" title="" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
            {label}
          </span>
        ) : (
          label
        )}
      </Label>
      {children}
    </div>
  )
}
