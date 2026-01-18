/**
 * SidebarNav - Reusable sidebar navigation component with selection state.
 * Used in Settings, Assignment tab, and other master-detail layouts.
 */

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { EllipsisVertical, Plus } from "@repo-edu/ui/components/icons"
import type { ReactNode } from "react"

export interface SidebarNavItem {
  id: string
  label: string
  icon?: ReactNode
  warning?: boolean
}

export interface SidebarNavAction {
  icon: ReactNode
  onClick: (id: string) => void
  title?: string
  /** Label shown in dropdown mode */
  label?: string
}

interface SidebarNavProps<T extends SidebarNavItem> {
  /** Section title displayed at the top */
  title: string
  /** List of navigation items */
  items: T[]
  /** Currently selected item ID */
  selectedId: string | null
  /** Callback when an item is selected */
  onSelect: (id: string) => void
  /** Optional actions shown on each item */
  actions?: SidebarNavAction[]
  /** How to display actions: inline buttons or dropdown menu */
  actionMode?: "inline" | "dropdown"
  /** Optional "add new" configuration */
  addNew?: {
    label: string
    onClick: () => void
  }
  /** Optional warning icon renderer */
  renderWarning?: (item: T) => ReactNode
  /** Width class for the sidebar */
  className?: string
}

export function SidebarNav<T extends SidebarNavItem>({
  title,
  items,
  selectedId,
  onSelect,
  actions,
  actionMode = "inline",
  addNew,
  renderWarning,
  className,
}: SidebarNavProps<T>) {
  return (
    <div className={cn("flex flex-col h-full border-r", className)}>
      <div className="flex items-center px-3 h-11 pb-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md transition-colors",
                  selectedId === item.id
                    ? "bg-blue-100 dark:bg-blue-700/60"
                    : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "flex-1 flex items-center gap-2 px-3 py-2 text-left",
                    "bg-transparent border-0 cursor-pointer",
                  )}
                >
                  {item.icon}
                  <span className="truncate text-sm">{item.label}</span>
                  {renderWarning?.(item)}
                </button>

                {actions && actions.length > 0 && actionMode === "inline" && (
                  <div className="flex items-center gap-0.5 pr-2">
                    {actions.map((action, index) => (
                      <Button
                        key={index}
                        size="icon-xs"
                        variant="ghost"
                        className="size-5"
                        onClick={() => action.onClick(item.id)}
                        title={action.title}
                      >
                        {action.icon}
                      </Button>
                    ))}
                  </div>
                )}

                {actions && actions.length > 0 && actionMode === "dropdown" && (
                  <div className="pr-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-5"
                          title="Actions"
                        >
                          <EllipsisVertical className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {actions.map((action, index) => (
                          <DropdownMenuItem
                            key={index}
                            onClick={() => action.onClick(item.id)}
                          >
                            <span className="mr-2 size-4 flex items-center justify-center">
                              {action.icon}
                            </span>
                            {action.label ?? action.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </li>
          ))}

          {addNew && (
            <li>
              <button
                type="button"
                onClick={addNew.onClick}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm",
                  "hover:bg-muted transition-colors",
                )}
              >
                <Plus className="size-4" />
                <span>{addNew.label}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}
