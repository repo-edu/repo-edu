import type {
  ActiveTab,
  PersistedActiveSurface,
} from "@repo-edu/domain/active-surface"

export function isDocumentEditingSurface(
  activeSurface: PersistedActiveSurface,
  activeTab: ActiveTab,
): boolean {
  return (
    activeSurface.kind === "course" &&
    (activeTab === "roster" || activeTab === "groups-assignments")
  )
}
