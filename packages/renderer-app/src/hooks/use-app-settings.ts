import { selectCredentials, selectPreferences } from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"

export function useAppSettings() {
  const settings = useSessionControllerSelector(selectPreferences)
  const credentials = useSessionControllerSelector(selectCredentials)

  return {
    settings,
    theme: settings.appearance.theme,
    lmsConnections: credentials.lmsConnections,
    gitConnections: credentials.gitConnections,
  }
}
