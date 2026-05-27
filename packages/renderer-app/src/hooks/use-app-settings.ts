import { useAppSettingsStore } from "../stores/app-settings-store.js"

export function useAppSettings() {
  const settings = useAppSettingsStore((s) => s.settings)
  const syncStatus = useAppSettingsStore((s) => s.syncStatus)

  return {
    settings,
    theme: settings.appearance.theme,
    lmsConnections: settings.lmsConnections,
    gitConnections: settings.gitConnections,
    syncStatus,
  }
}
