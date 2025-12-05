import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"
import type * as React from "react"

import { cn } from "../../lib/utils"

interface CheckboxProps
  extends React.ComponentProps<typeof CheckboxPrimitive.Root> {
  size?: "default" | "sm" | "xs"
}

function Checkbox({ className, size = "default", ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        size === "xs" && "size-3.5",
        size === "sm" && "size-3.5",
        size === "default" && "size-4",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className={cn(size === "xs" ? "size-2.5" : "size-3.5")} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
