import { Button } from "@repo-edu/ui"
import { Settings } from "@repo-edu/ui/components/icons"
import { useEffect } from "react"
import { useSessionController } from "../../session/session-controller-context.js"
import { useConnectionsStore } from "../../stores/connections-store.js"
import { useSettingsViewStore } from "../../stores/settings-view-store.js"

export function SettingsButton() {
  const controller = useSessionController()
  const openSettings = useSettingsViewStore((s) => s.openSettings)
  const lmsStatus = useConnectionsStore((s) => s.lmsStatus)
  const lmsStatuses = useConnectionsStore((s) => s.lmsStatuses)
  const gitStatuses = useConnectionsStore((s) => s.gitStatuses)

  const hasConnected =
    lmsStatus === "connected" ||
    Object.values(lmsStatuses).some((status) => status === "connected") ||
    Object.values(gitStatuses).some((status) => status === "connected")

  // Ctrl+, or Cmd+, opens the settings sheet.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      controller.operations.change(() => {
        if (!(e.metaKey || e.ctrlKey) || e.key !== ",") return
        e.preventDefault()
        openSettings()
      })
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [controller, openSettings])

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 p-0"
      onClick={() => openSettings()}
    >
      <Settings className="size-[18px]" />
      {hasConnected && (
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success" />
      )}
      <span className="sr-only">Settings</span>
    </Button>
  )
}
