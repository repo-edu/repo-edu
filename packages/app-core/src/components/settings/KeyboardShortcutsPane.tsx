/**
 * KeyboardShortcutsPane - Display keyboard shortcuts reference.
 * Used within the SettingsDialog.
 */

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0

const modKey = isMac ? "⌘" : "Ctrl"

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: [modKey, "S"], description: "Save current profile" },
      { keys: [modKey, ","], description: "Open Settings" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: [modKey, "1"], description: "Go to Roster tab" },
      { keys: [modKey, "2"], description: "Go to Assignment tab" },
      { keys: [modKey, "3"], description: "Go to Operation tab" },
    ],
  },
]

export function KeyboardShortcutsPane() {
  return (
    <div className="space-y-6">
      {shortcutGroups.map((group) => (
        <div key={group.title}>
          <h3 className="font-medium mb-3">{group.title}</h3>
          <div className="space-y-2">
            {group.shortcuts.map((shortcut) => (
              <div
                key={shortcut.description}
                className="flex items-center justify-between py-1.5"
              >
                <span>{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, index) => (
                    <span key={key}>
                      <kbd className="px-2 py-1 text-xs font-medium bg-muted border rounded">
                        {key}
                      </kbd>
                      {index < shortcut.keys.length - 1 && (
                        <span className="mx-0.5 text-muted-foreground">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
