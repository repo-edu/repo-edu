import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const textareaVariants = cva(
  "placeholder:text-muted-foreground border-input flex min-h-16 w-full rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      size: {
        default: "px-3 py-2 text-sm",
        sm: "px-3 py-1.5 text-sm",
        xs: "px-2 py-1 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface TextareaProps
  extends Omit<React.ComponentProps<"textarea">, "size">,
    VariantProps<typeof textareaVariants> {}

function Textarea({ className, size, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ size, className }))}
      {...props}
    />
  )
}

export { Textarea, textareaVariants }
