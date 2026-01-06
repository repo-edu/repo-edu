/**
 * SettingsButton - Opens the Settings sheet.
 * Shows a green dot when connections are active.
 */

import { Button } from "@repo-edu/ui"
import { Settings } from "@repo-edu/ui/components/icons"
import { useConnectionsStore } from "../stores/connectionsStore"
import { useUiStore } from "../stores/uiStore"

export function SettingsButton() {
  const openSettings = useUiStore((state) => state.openSettings)
  const lmsStatus = useConnectionsStore((state) => state.lmsStatus)
  const gitStatuses = useConnectionsStore((state) => state.gitStatuses)

  const hasConnected =
    lmsStatus === "connected" ||
    Object.values(gitStatuses).some((s) => s === "connected")

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground relative"
      onClick={() => openSettings()}
    >
      <Settings className="size-4" />
      {hasConnected && (
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success" />
      )}
      <span className="sr-only">Settings</span>
    </Button>
  )
}
