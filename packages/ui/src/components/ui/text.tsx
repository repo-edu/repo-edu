import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../../lib/utils"

const textVariants = cva("", {
  variants: {
    variant: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
      warning: "text-warning",
      success: "text-success",
    },
    size: {
      default: "",
      xs: "text-xs",
      base: "text-base",
      lg: "text-lg",
    },
    weight: {
      default: "",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
    weight: "default",
  },
})

interface TextProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof textVariants> {
  asChild?: boolean
}

function Text({
  className,
  variant,
  size,
  weight,
  asChild = false,
  ...props
}: TextProps) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="text"
      className={cn(textVariants({ variant, size, weight, className }))}
      {...props}
    />
  )
}

export { Text, textVariants }
