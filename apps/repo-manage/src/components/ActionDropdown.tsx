import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import type { ReactNode } from "react"
import { useState } from "react"
import { MdiChevronDown } from "./icons/MdiChevronDown"
import { MdiPlus } from "./icons/MdiPlus"

export interface ActionDropdownItem {
  /** Unique identifier for the item */
  id: string
  /** Display label for the item */
  label: string
  /** Optional status icon displayed before the label */
  statusIcon?: ReactNode
  /** Optional tooltip for the status icon */
  statusTitle?: string
}

export interface ItemAction<T extends ActionDropdownItem> {
  /** Icon to display for the action */
  icon: ReactNode
  /** Click handler, receives item and index */
  onClick: (item: T, index: number) => void
  /** Optional function to determine if action is disabled */
  disabled?: (item: T, index: number) => boolean
  /** Optional tooltip text */
  title?: string | ((item: T, index: number) => string)
}

export interface ActionDropdownProps<T extends ActionDropdownItem> {
  /** Array of items to display */
  items: T[]
  /** Index of the currently active/selected item */
  activeIndex: number
  /** Callback when an item is selected */
  onSelect: (index: number) => void
  /** Array of action buttons to display for each item */
  itemActions: ItemAction<T>[]
  /** Callback when add button is clicked */
  onAdd: () => void
  /** Label for the add button */
  addLabel?: string
  /** Placeholder text when no item is selected */
  placeholder?: string
  /** Minimum width of the dropdown trigger */
  minWidth?: string
  /** Maximum width of the dropdown trigger */
  maxWidth?: string
  /** Minimum width of the dropdown content */
  contentMinWidth?: string
}

export function ActionDropdown<T extends ActionDropdownItem>({
  items,
  activeIndex,
  onSelect,
  itemActions,
  onAdd,
  addLabel = "Add item",
  placeholder = "Select item",
  minWidth = "200px",
  maxWidth = "400px",
  contentMinWidth = "300px",
}: ActionDropdownProps<T>) {
  const [open, setOpen] = useState(false)

  const activeItem = items[activeIndex]

  const handleSelect = (index: number) => {
    onSelect(index)
    setOpen(false)
  }

  const handleActionClick = (
    action: ItemAction<T>,
    item: T,
    index: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation()
    action.onClick(item, index)
  }

  const handleAdd = () => {
    setOpen(false)
    onAdd()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleSelect(index)
    }
  }

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleAdd()
    }
  }

  const getActionTitle = (action: ItemAction<T>, item: T, index: number) => {
    if (typeof action.title === "function") {
      return action.title(item, index)
    }
    return action.title
  }

  if (items.length === 0) {
    return (
      <Button size="xs" variant="outline" onClick={onAdd} className="gap-1">
        <MdiPlus className="size-3.5" />
        {addLabel}
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          className="justify-between gap-2 w-fit"
          style={{ minWidth, maxWidth }}
        >
          <span className="flex items-center gap-1.5 truncate">
            {activeItem?.statusIcon !== undefined && (
              <span
                className="size-3 shrink-0 flex items-center justify-center"
                title={activeItem.statusTitle}
              >
                {activeItem.statusIcon}
              </span>
            )}
            <span className="truncate">
              {activeItem ? activeItem.label : placeholder}
            </span>
          </span>
          <MdiChevronDown className="size-3.5 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" style={{ minWidth: contentMinWidth }}>
        {items.map((item, index) => (
          <div
            key={item.id}
            role="option"
            tabIndex={0}
            aria-selected={index === activeIndex}
            onClick={() => handleSelect(index)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer",
              "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
              index === activeIndex && "bg-blue-100 dark:bg-blue-700/60",
            )}
          >
            <span className="flex items-center gap-1.5 truncate min-w-0">
              {item.statusIcon !== undefined && (
                <span
                  className="size-3 shrink-0 flex items-center justify-center"
                  title={item.statusTitle}
                >
                  {item.statusIcon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </span>

            <div className="flex items-center gap-0.5 shrink-0">
              {itemActions.map((action, actionIndex) => {
                const isDisabled = action.disabled?.(item, index) ?? false
                return (
                  <Button
                    key={actionIndex}
                    size="icon-xs"
                    variant="ghost"
                    onClick={(e) => handleActionClick(action, item, index, e)}
                    disabled={isDisabled}
                    title={getActionTitle(action, item, index)}
                    className="size-5"
                  >
                    {action.icon}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}

        <DropdownMenuSeparator />

        <div
          role="option"
          tabIndex={0}
          aria-selected={false}
          onClick={handleAdd}
          onKeyDown={handleAddKeyDown}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
        >
          <MdiPlus className="size-3.5" />
          {addLabel}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
