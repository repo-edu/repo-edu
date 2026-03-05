import type { ThemePreference, WindowChromeMode } from "@repo-edu/domain";
import {
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui";
import { useState } from "react";
import { useAppSettingsStore } from "../../stores/app-settings-store.js";

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const WINDOW_CHROME_MODES: Array<{ value: WindowChromeMode; label: string }> = [
  { value: "system", label: "System Default" },
  { value: "hiddenInset", label: "Hidden Inset" },
];

export function DisplayPane() {
  const theme = useAppSettingsStore((state) => state.settings.appearance.theme);
  const windowChrome = useAppSettingsStore(
    (state) => state.settings.appearance.windowChrome,
  );
  const setTheme = useAppSettingsStore((state) => state.setTheme);
  const setWindowChrome = useAppSettingsStore((state) => state.setWindowChrome);
  const saveAppSettings = useAppSettingsStore((state) => state.save);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAppSettings();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (value: ThemePreference) => {
    setTheme(value);
    void persist();
  };

  const handleWindowChromeChange = (value: WindowChromeMode) => {
    setWindowChrome(value);
    void persist();
  };

  return (
    <div className="space-y-6">
      <FormField
        label="Theme"
        htmlFor="display-theme"
        description="Choose how the application appears."
      >
        <Select value={theme} onValueChange={handleThemeChange}>
          <SelectTrigger id="display-theme" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Window Chrome"
        htmlFor="display-window-chrome"
        description="Desktop shell window frame behavior."
      >
        <Select value={windowChrome} onValueChange={handleWindowChromeChange}>
          <SelectTrigger id="display-window-chrome" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_CHROME_MODES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {saving && (
        <Text className="text-xs text-muted-foreground">Saving settings…</Text>
      )}
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </div>
  );
}
