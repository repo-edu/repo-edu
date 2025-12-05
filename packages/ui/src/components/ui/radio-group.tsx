import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { CircleIcon } from "lucide-react"
import type * as React from "react"

import { cn } from "../../lib/utils"

interface RadioGroupProps
  extends React.ComponentProps<typeof RadioGroupPrimitive.Root> {
  size?: "default" | "sm" | "xs"
}

function RadioGroup({
  className,
  size = "default",
  ...props
}: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      data-size={size}
      className={cn("grid", size === "xs" ? "gap-1.5" : "gap-3", className)}
      {...props}
    />
  )
}

interface RadioGroupItemProps
  extends React.ComponentProps<typeof RadioGroupPrimitive.Item> {
  size?: "default" | "sm" | "xs"
}

function RadioGroupItem({
  className,
  size = "default",
  ...props
}: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aspect-square shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        size === "xs" ? "size-3.5" : "size-4",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon
          className={cn(
            "fill-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            size === "xs" ? "size-1.5" : "size-2",
          )}
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
