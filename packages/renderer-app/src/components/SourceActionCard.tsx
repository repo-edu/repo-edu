import { cn, Text } from "@repo-edu/ui"
import type { ReactNode } from "react"

/** One Home card: a button that names a way to start, with room for the
 * fields a selected card shows below it. */
export function SourceActionCard({
  title,
  description,
  selected,
  onClick,
  children,
}: {
  title: string
  description: ReactNode
  selected: boolean
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-foreground/30",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-left p-3 rounded-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div
          className={cn(
            "font-semibold text-sm mb-1",
            selected && "text-primary",
          )}
        >
          {title}
        </div>
        <Text className="text-xs text-muted-foreground select-text font-normal">
          {description}
        </Text>
      </button>
      {selected && children !== undefined && (
        <div className="px-3 pb-3 space-y-4">{children}</div>
      )}
    </div>
  )
}
