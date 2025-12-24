/**
 * Profile actions hook - encapsulates all profile CRUD operations
 *
 * Extracts profile business logic from SettingsSidebar, making it:
 * - Testable in isolation
 * - Reusable across components
 * - Separated from UI concerns
 */

import { useCallback, useEffect, useState } from "react"
import * as settingsService from "../services/settingsService"
import { getErrorMessage } from "../types/error"
import type { GuiSettings, ProfileSettings } from "../types/settings"

export interface UseProfileActionsOptions {
  /** Get current profile settings from the form stores */
  getProfileSettings: () => ProfileSettings
  /** Callback when settings are loaded from a profile */
  onSettingsLoaded: (settings: GuiSettings, updateBaseline: boolean) => void
  /** Callback to display messages to the user */
  onMessage: (message: string) => void
  /** Callback when settings are saved (to update dirty state) */
  onSaved: () => void
  /** Callback for success feedback (e.g., flash animation) */
  onSuccess?: () => void
}

export interface ProfileActions {
  /** List of available profile names */
  profiles: string[]
  /** Currently active profile name */
  activeProfile: string | null
  /** Path to settings directory */
  settingsPath: string
  /** Save current settings to the active profile */
  saveProfile: () => Promise<void>
  /** Revert to last saved state of active profile */
  revertProfile: () => Promise<void>
  /** Load a profile by name (switches active profile) */
  loadProfile: (name: string) => Promise<void>
  /** Create a new profile */
  createProfile: (name: string, copyFromCurrent: boolean) => Promise<void>
  /** Rename the active profile */
  renameProfile: (newName: string) => Promise<void>
  /** Delete the active profile */
  deleteProfile: () => Promise<void>
  /** Refresh the profiles list */
  refreshProfiles: () => Promise<void>
}

function extractProfileSettings(settings: GuiSettings): ProfileSettings {
  return {
    git: settings.git,
    lms: settings.lms,
    repo: settings.repo,
  }
}

export function useProfileActions(
  options: UseProfileActionsOptions,
): ProfileActions {
  const {
    getProfileSettings,
    onSettingsLoaded,
    onMessage,
    onSaved,
    onSuccess,
  } = options

  const [profiles, setProfiles] = useState<string[]>([])
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [settingsPath, setSettingsPath] = useState<string>("")

  const loadSettingsPath = useCallback(async () => {
    try {
      const path = await settingsService.getSettingsPath()
      setSettingsPath(path)
    } catch (error) {
      console.error("Failed to get settings path:", error)
    }
  }, [])

  const refreshProfiles = useCallback(async () => {
    try {
      const profileList = await settingsService.listProfiles()
      setProfiles(profileList)
      const active = await settingsService.getActiveProfile()
      setActiveProfile(active)
    } catch (error) {
      console.error("Failed to load profiles:", error)
    }
  }, [])

  useEffect(() => {
    loadSettingsPath()
    refreshProfiles()
  }, [loadSettingsPath, refreshProfiles])

  const saveProfile = useCallback(async () => {
    if (!activeProfile) {
      onMessage("✗ No active profile to save")
      return
    }
    try {
      await settingsService.saveProfile(activeProfile, getProfileSettings())
      onSuccess?.()
      onMessage(`✓ Saved profile: ${activeProfile}`)
      onSaved()
    } catch (error) {
      onMessage(`✗ Failed to save profile: ${getErrorMessage(error)}`)
    }
  }, [activeProfile, getProfileSettings, onMessage, onSaved, onSuccess])

  const revertProfile = useCallback(async () => {
    if (!activeProfile) return
    try {
      const result = await settingsService.loadProfile(activeProfile)
      const hasWarnings = result.warnings.length > 0
      onSettingsLoaded(result.settings, !hasWarnings)
      onSuccess?.()
      onMessage(`✓ Reverted to saved: ${activeProfile}`)

      if (hasWarnings) {
        for (const warning of result.warnings) {
          onMessage(`⚠ ${warning}`)
        }
        onMessage("→ Click Save to persist corrected settings.")
      }
    } catch (error) {
      onMessage(`✗ Failed to revert profile: ${getErrorMessage(error)}`)
    }
  }, [activeProfile, onSettingsLoaded, onMessage, onSuccess])

  const loadProfile = useCallback(
    async (name: string) => {
      if (!name) return
      try {
        const result = await settingsService.loadProfile(name)
        await settingsService.setActiveProfile(name)

        // If warnings exist, don't update baseline (keeps dirty state so user can save)
        const hasWarnings = result.warnings.length > 0
        onSettingsLoaded(result.settings, !hasWarnings)

        setActiveProfile(name)
        onSuccess?.()
        onMessage(`✓ Loaded profile: ${name}`)

        // Display warnings after success message
        if (hasWarnings) {
          for (const warning of result.warnings) {
            onMessage(`⚠ ${warning}`)
          }
          onMessage("→ Click Save to persist corrected settings.")
        }
      } catch (error) {
        // Load defaults so the app remains functional, but don't update baseline
        // so settings show as dirty and can be saved to fix the profile
        try {
          await settingsService.setActiveProfile(name)
        } catch {
          // Ignore - profile might not exist on disk yet
        }
        const defaultSettings = await settingsService.getDefaultSettings()
        onSettingsLoaded(defaultSettings, false)
        setActiveProfile(name)
        onMessage(
          `⚠ Failed to load profile '${name}':\n${getErrorMessage(error)}\n→ Using default settings for profile '${name}'.`,
        )
      }
    },
    [onSettingsLoaded, onMessage, onSuccess],
  )

  const createProfile = useCallback(
    async (name: string, copyFromCurrent: boolean) => {
      if (!name.trim()) {
        onMessage("✗ Please enter a profile name")
        return
      }
      try {
        const settings = copyFromCurrent
          ? getProfileSettings()
          : extractProfileSettings(await settingsService.getDefaultSettings())
        await settingsService.saveProfile(name, settings)
        const loaded = await settingsService.loadProfile(name)
        onSettingsLoaded(loaded.settings, true)
        setActiveProfile(name)
        await refreshProfiles()
        onSuccess?.()
        onMessage(`✓ Created and activated profile: ${name}`)
      } catch (error) {
        onMessage(`✗ Failed to create profile: ${getErrorMessage(error)}`)
      }
    },
    [
      getProfileSettings,
      onSettingsLoaded,
      onMessage,
      onSuccess,
      refreshProfiles,
    ],
  )

  const renameProfile = useCallback(
    async (newName: string) => {
      if (!activeProfile) {
        onMessage("✗ No active profile to rename")
        return
      }
      if (!newName.trim()) {
        onMessage("✗ Please enter a profile name")
        return
      }
      try {
        await settingsService.renameProfile(activeProfile, newName)
        onSuccess?.()
        onMessage(`✓ Renamed profile to: ${newName}`)
        await refreshProfiles()
        setActiveProfile(newName)
      } catch (error) {
        onMessage(`✗ Failed to rename profile: ${getErrorMessage(error)}`)
      }
    },
    [activeProfile, onMessage, onSuccess, refreshProfiles],
  )

  const deleteProfile = useCallback(async () => {
    if (!activeProfile) {
      onMessage("✗ No active profile to delete")
      return
    }

    const otherProfile = profiles.find((p) => p !== activeProfile) || "Default"
    const willCreateDefault = !profiles.some((p) => p !== activeProfile)

    try {
      await settingsService.deleteProfile(activeProfile)
      onMessage(`✓ Deleted profile: ${activeProfile}`)

      if (willCreateDefault) {
        // Create and switch to Default profile
        await settingsService.saveProfile("Default", getProfileSettings())
        await settingsService.setActiveProfile("Default")
        setActiveProfile("Default")
        onMessage(`✓ Created new profile: Default`)
      } else {
        // Switch to another existing profile
        await loadProfile(otherProfile)
      }

      await refreshProfiles()
      onSuccess?.()
    } catch (error) {
      onMessage(`✗ Failed to delete profile: ${getErrorMessage(error)}`)
    }
  }, [
    activeProfile,
    profiles,
    getProfileSettings,
    loadProfile,
    onMessage,
    onSuccess,
    refreshProfiles,
  ])

  return {
    profiles,
    activeProfile,
    settingsPath,
    saveProfile,
    revertProfile,
    loadProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    refreshProfiles,
  }
}
