import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../../lib/utils"

const labelVariants = cva(
  "flex items-center gap-2 leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
  {
    variants: {
      size: {
        default: "text-sm",
        sm: "text-sm",
        xs: "text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
)

interface LabelProps
  extends React.ComponentProps<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

function Label({ className, size, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelVariants({ size, className }))}
      {...props}
    />
  )
}

export { Label, labelVariants }
