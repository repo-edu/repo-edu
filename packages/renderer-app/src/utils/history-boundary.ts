import type { PersistedActiveSurface } from "@repo-edu/domain/settings"
import type { ActiveTab } from "../types/index.js"

export function isDocumentEditingSurface(
  activeSurface: PersistedActiveSurface,
  activeTab: ActiveTab,
): boolean {
  return (
    activeSurface.kind === "course" &&
    (activeTab === "roster" || activeTab === "groups-assignments")
  )
}
