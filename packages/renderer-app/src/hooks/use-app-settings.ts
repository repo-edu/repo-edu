import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCredentialsStore } from "../stores/credentials-store.js"

export function useAppSettings() {
  const settings = useAppSettingsStore((s) => s.settings)
  const credentials = useCredentialsStore((s) => s.credentials)

  return {
    settings,
    theme: settings.appearance.theme,
    lmsConnections: credentials.lmsConnections,
    gitConnections: credentials.gitConnections,
  }
}
