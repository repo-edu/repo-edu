import { Button } from "@repo-edu/ui"
import { Settings } from "@repo-edu/ui/components/icons"
import { useConnectionsStore } from "../stores/connections-store.js"
import { useUiStore } from "../stores/ui-store.js"

export function SettingsButton() {
  const openSettings = useUiStore((s) => s.openSettings)
  const lmsStatus = useConnectionsStore((s) => s.lmsStatus)
  const lmsStatuses = useConnectionsStore((s) => s.lmsStatuses)
  const gitStatuses = useConnectionsStore((s) => s.gitStatuses)

  const hasConnected =
    lmsStatus === "connected" ||
    Object.values(lmsStatuses).some((status) => status === "connected") ||
    Object.values(gitStatuses).some((status) => status === "connected")

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 p-0"
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
