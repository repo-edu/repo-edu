import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../../lib/utils"

const alertVariants = cva(
  "relative w-full rounded-md border p-3 [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg]:size-4 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-9",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive",
        warning:
          "border-warning/30 bg-warning-muted text-warning [&>svg]:text-warning",
        success:
          "border-success/30 bg-success/10 text-success [&>svg]:text-success",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("[&_p]:leading-relaxed", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
