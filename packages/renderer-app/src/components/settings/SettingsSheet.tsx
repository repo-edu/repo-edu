import { cn, Sheet, SheetContent, SheetTitle } from "@repo-edu/ui"
import {
  Brain,
  Command,
  GitBranch,
  GraduationCap,
  HardDrive,
  Monitor,
  X,
} from "@repo-edu/ui/components/icons"
import type { ReactNode } from "react"
import { useUiStore } from "../../stores/ui-store.js"
import {
  hasMacDesktopInset,
  MAC_TRAFFIC_LIGHT_INSET_PX,
} from "../../utils/platform.js"
import { DisplayPane } from "./DisplayPane.js"
import { GitConnectionsPane } from "./GitConnectionsPane.js"
import { KeyboardShortcutsPane } from "./KeyboardShortcutsPane.js"
import { LlmConnectionsPane } from "./LlmConnectionsPane.js"
import { LmsConnectionsPane } from "./LmsConnectionsPane.js"
import { StoragePane } from "./StoragePane.js"

type SettingsCategory =
  | "lms-connections"
  | "git-connections"
  | "llm-connections"
  | "display"
  | "shortcuts"
  | "storage"

type CategoryItem = {
  id: SettingsCategory
  label: string
  icon: ReactNode
}

const categories: CategoryItem[] = [
  {
    id: "display",
    label: "Display",
    icon: <Monitor className="size-4" />,
  },
  {
    id: "lms-connections",
    label: "LMS Connections",
    icon: <GraduationCap className="size-4" />,
  },
  {
    id: "git-connections",
    label: "Git Connections",
    icon: <GitBranch className="size-4" />,
  },
  {
    id: "llm-connections",
    label: "LLM Connections",
    icon: <Brain className="size-4" />,
  },
  {
    id: "storage",
    label: "Storage",
    icon: <HardDrive className="size-4" />,
  },
  {
    id: "shortcuts",
    label: "Keyboard Shortcuts",
    icon: <Command className="size-4" />,
  },
]

export function SettingsSheet() {
  const open = useUiStore((state) => state.settingsDialogOpen)
  const setOpen = useUiStore((state) => state.setSettingsDialogOpen)
  const activeCategory = useUiStore((state) => state.settingsCategory)
  const macInset = hasMacDesktopInset()
  const macInsetMaxWidth = macInset
    ? `min(42rem, calc(100vw - ${MAC_TRAFFIC_LIGHT_INSET_PX}px))`
    : undefined

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className="w-full sm:max-w-2xl flex flex-col p-0 gap-0"
        style={macInsetMaxWidth ? { maxWidth: macInsetMaxWidth } : undefined}
        showCloseButton={false}
      >
        <div className="app-drag h-11 px-4 border-b shrink-0 flex items-center">
          <SheetTitle className="font-medium">Settings</SheetTitle>
          <div className="flex-1" />
          <button
            type="button"
            className="app-no-drag inline-flex items-center justify-center rounded-md border border-transparent h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <nav className="w-52 border-r p-2 shrink-0 overflow-y-auto">
            <ul className="space-y-1">
              {categories.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() =>
                      useUiStore.getState().openSettings(category.id)
                    }
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap",
                      activeCategory === category.id
                        ? "bg-selection"
                        : "hover:bg-muted",
                    )}
                  >
                    {category.icon}
                    {category.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex-1 overflow-y-auto p-6 pt-4">
            <div
              className={cn(
                activeCategory === "lms-connections" ? "block" : "hidden",
              )}
              aria-hidden={activeCategory !== "lms-connections"}
            >
              <LmsConnectionsPane />
            </div>
            <div
              className={cn(
                activeCategory === "git-connections" ? "block" : "hidden",
              )}
              aria-hidden={activeCategory !== "git-connections"}
            >
              <GitConnectionsPane />
            </div>
            <div
              className={cn(
                activeCategory === "llm-connections" ? "block" : "hidden",
              )}
              aria-hidden={activeCategory !== "llm-connections"}
            >
              <LlmConnectionsPane />
            </div>
            <div
              className={cn(activeCategory === "display" ? "block" : "hidden")}
              aria-hidden={activeCategory !== "display"}
            >
              <DisplayPane />
            </div>
            <div
              className={cn(activeCategory === "storage" ? "block" : "hidden")}
              aria-hidden={activeCategory !== "storage"}
            >
              <StoragePane />
            </div>
            <div
              className={cn(
                activeCategory === "shortcuts" ? "block" : "hidden",
              )}
              aria-hidden={activeCategory !== "shortcuts"}
            >
              <KeyboardShortcutsPane />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
