import { Button } from "@repo-edu/ui";
import { useUiStore } from "../stores/ui-store.js";

export function SettingsButton() {
  const openSettings = useUiStore((s) => s.openSettings);

  return (
    <Button variant="ghost" size="sm" onClick={() => openSettings()}>
      Settings
    </Button>
  );
}
