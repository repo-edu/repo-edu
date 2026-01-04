import { useCallback, useEffect, useRef } from "react"
import * as settingsService from "../services/settingsService"
import { getErrorMessage } from "../types/error"
import type { GuiSettings } from "../types/settings"

interface Options {
  onLoaded: (settings: GuiSettings) => void
  /** Called when dirty state should be forced (invalidate baselines) */
  onForceDirty?: () => void
  log: (msg: string) => void
}

/**
 * Loads settings once on mount and exposes a manual reload.
 */
export function useLoadSettings({ onLoaded, onForceDirty, log }: Options) {
  const settingsLoadedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const fileExists = await settingsService.settingsExist()
      const result = await settingsService.loadSettingsWithWarnings()

      onLoaded(result.settings as unknown as GuiSettings)

      const activeProfile = await settingsService.getActiveProfile()
      if (fileExists) {
        log(`✓ Settings loaded from profile: ${activeProfile || "Default"}`)
      } else {
        log(`✓ Created profile: ${activeProfile || "Default"}`)
      }

      // Show warnings for any corrected issues in settings files
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          log(`⚠ ${warning}`)
        }
        log("→ Click Save to persist corrected settings.")
        // Force dirty state so user can save to clean up settings files
        onForceDirty?.()
      }
    } catch (error) {
      console.error("Failed to load settings:", error)

      // Try to get the profile name that failed
      let profileName = "unknown"
      try {
        profileName = (await settingsService.getActiveProfile()) || "Default"
      } catch {
        // Ignore
      }

      log(
        `⚠ Failed to load profile '${profileName}':\n${getErrorMessage(error)}`,
      )
      log(`→ Using default settings for profile '${profileName}'.`)

      const defaultSettings = await settingsService.getDefaultSettings()
      onLoaded(defaultSettings as GuiSettings)
      // Force dirty state so user can save to fix the profile
      onForceDirty?.()
    }
  }, [onLoaded, onForceDirty, log])

  useEffect(() => {
    if (!settingsLoadedRef.current) {
      settingsLoadedRef.current = true
      load()
    }
  }, [load])

  return { loadSettings: load }
}
