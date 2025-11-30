import { useCallback, useEffect, useRef } from "react";
import { DEFAULT_GUI_SETTINGS, type GuiSettings } from "../types/settings";
import { getErrorMessage } from "../types/error";
import * as settingsService from "../services/settingsService";
import { hashSnapshot } from "../utils/snapshot";

interface Options {
  onLoaded: (settings: GuiSettings) => void;
  setBaselines: (hashes: { lms: number; repo: number }) => void;
  lmsState: () => unknown;
  repoState: () => unknown;
  log: (msg: string) => void;
}

/**
 * Loads settings once on mount and exposes a manual reload.
 */
export function useLoadSettings({ onLoaded, setBaselines, lmsState, repoState, log }: Options) {
  const settingsLoadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const fileExists = await settingsService.settingsExist();
      const settings = await settingsService.loadSettings();

      onLoaded(settings);

      setBaselines({
        lms: hashSnapshot(lmsState()),
        repo: hashSnapshot(repoState()),
      });

      const activeProfile = await settingsService.getActiveProfile();
      if (fileExists) {
        log(`✓ Settings loaded from profile: ${activeProfile || "Default"}`);
      } else {
        log(`✓ Created profile: ${activeProfile || "Default"}`);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      log("⚠ Cannot load settings file, using default settings");
      log(`  Error: ${getErrorMessage(error)}`);

      // Apply defaults so the app remains functional
      onLoaded(DEFAULT_GUI_SETTINGS);
      setBaselines({
        lms: hashSnapshot(lmsState()),
        repo: hashSnapshot(repoState()),
      });
    }
  }, [lmsState, repoState, onLoaded, setBaselines, log]);

  useEffect(() => {
    if (!settingsLoadedRef.current) {
      settingsLoadedRef.current = true;
      load();
    }
  }, [load]);

  return { loadSettings: load };
}

