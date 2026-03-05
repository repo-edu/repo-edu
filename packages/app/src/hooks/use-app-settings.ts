import { useAppSettingsStore } from "../stores/app-settings-store.js";

export function useAppSettings() {
  const settings = useAppSettingsStore((s) => s.settings);
  const status = useAppSettingsStore((s) => s.status);
  const error = useAppSettingsStore((s) => s.error);
  const load = useAppSettingsStore((s) => s.load);
  const save = useAppSettingsStore((s) => s.save);

  return {
    settings,
    theme: settings.appearance.theme,
    lmsConnections: settings.lmsConnections,
    gitConnections: settings.gitConnections,
    status,
    error,
    load,
    save,
  };
}
