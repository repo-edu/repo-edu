import { useCallback, useEffect, useRef } from "react"
import * as settingsService from "../services/settingsService"
import { getErrorMessage } from "../types/error"
import type { GuiSettings } from "../types/settings"
import { hashSnapshot } from "../utils/snapshot"

interface Options {
  onLoaded: (settings: GuiSettings) => void
  setBaselines: (hashes: { lms: number; repo: number }) => void
  lmsState: () => unknown
  repoState: () => unknown
  log: (msg: string) => void
}

/**
 * Loads settings once on mount and exposes a manual reload.
 */
export function useLoadSettings({
  onLoaded,
  setBaselines,
  lmsState,
  repoState,
  log,
}: Options) {
  const settingsLoadedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const fileExists = await settingsService.settingsExist()
      const result = await settingsService.loadSettingsWithWarnings()

      onLoaded(result.settings)

      setBaselines({
        lms: hashSnapshot(lmsState()),
        repo: hashSnapshot(repoState()),
      })

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

      // Try to load app settings (window size, etc.) even if profile failed
      const defaultSettings = await settingsService.getDefaultSettings()
      let settings = defaultSettings
      try {
        const appSettings = await settingsService.loadAppSettings()
        settings = { ...defaultSettings, ...appSettings }
      } catch {
        // Ignore - use full defaults
      }

      onLoaded(settings)
      // Force dirty state so user can save to fix the profile
      setBaselines({ lms: 0, repo: 0 })
    }
  }, [lmsState, repoState, onLoaded, setBaselines, log])

  useEffect(() => {
    if (!settingsLoadedRef.current) {
      settingsLoadedRef.current = true
      load()
    }
  }, [load])

  return { loadSettings: load }
}
