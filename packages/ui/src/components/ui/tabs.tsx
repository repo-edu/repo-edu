import * as TabsPrimitive from "@radix-ui/react-tabs"
import type * as React from "react"

import { cn } from "../../lib/utils"

interface TabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  size?: "default" | "compact"
}

function Tabs({ className, size = "default", ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-size={size}
      className={cn(
        "flex flex-col",
        size === "compact" ? "gap-1" : "gap-2",
        className,
      )}
      {...props}
    />
  )
}

interface TabsListProps
  extends React.ComponentProps<typeof TabsPrimitive.List> {
  size?: "default" | "compact"
}

function TabsList({ className, size = "default", ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "text-muted-foreground inline-flex w-fit items-center",
        size === "compact" ? "h-8" : "h-10",
        className,
      )}
      {...props}
    />
  )
}

interface TabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
  size?: "default" | "compact"
}

function TabsTrigger({
  className,
  size = "default",
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "focus-visible:outline-ring inline-flex h-full items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        size === "compact" ? "px-2 py-0.5 text-xs" : "px-2 py-1",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
