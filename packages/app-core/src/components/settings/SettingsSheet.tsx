/**
 * SettingsSheet - Unified settings panel with sidebar navigation.
 * Slides in from the right side.
 * Contains: Connections, Display, Keyboard Shortcuts
 */

import { Sheet, SheetContent, SheetTitle } from "@repo-edu/ui"
import { Command, Link, Monitor, X } from "@repo-edu/ui/components/icons"
import { cn } from "@repo-edu/ui/lib/utils"
import { useUiStore } from "../../stores/uiStore"
import { ConnectionsPane } from "./ConnectionsPane"
import { DisplayPane } from "./DisplayPane"
import { KeyboardShortcutsPane } from "./KeyboardShortcutsPane"

type SettingsCategory = "connections" | "display" | "shortcuts"

interface CategoryItem {
  id: SettingsCategory
  label: string
  icon: React.ReactNode
}

const categories: CategoryItem[] = [
  {
    id: "connections",
    label: "Connections",
    icon: <Link className="size-4" />,
  },
  { id: "display", label: "Display", icon: <Monitor className="size-4" /> },
  {
    id: "shortcuts",
    label: "Keyboard Shortcuts",
    icon: <Command className="size-4" />,
  },
]

export function SettingsSheet() {
  const open = useUiStore((state) => state.settingsDialogOpen)
  const setOpen = useUiStore((state) => state.setSettingsDialogOpen)
  const activeCategory = useUiStore((state) => state.settingsDialogCategory)
  const setCategory = useUiStore((state) => state.setSettingsDialogCategory)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className="w-full sm:max-w-2xl flex flex-col p-0 gap-0"
        showCloseButton={false}
      >
        {/* Custom header matching tab bar height */}
        <div className="h-11 px-4 border-b shrink-0 flex items-center">
          <SheetTitle className="font-medium">Settings</SheetTitle>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-sm p-1 hover:bg-muted"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-48 border-r p-2 shrink-0 overflow-y-auto">
            <ul className="space-y-1">
              {categories.map((cat) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap",
                      activeCategory === cat.id
                        ? "bg-blue-100 dark:bg-blue-700/60"
                        : "hover:bg-muted",
                    )}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeCategory === "connections" && <ConnectionsPane />}
            {activeCategory === "display" && <DisplayPane />}
            {activeCategory === "shortcuts" && <KeyboardShortcutsPane />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
