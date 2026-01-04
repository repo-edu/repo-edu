/**
 * Load profile hook - loads profile settings and roster when profile changes.
 *
 * Replaces useLoadSettings for the roster-centric design.
 */

import { useEffect } from "react"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"

/**
 * Hook to load profile settings and roster when the profile name changes.
 *
 * @param profileName - The name of the profile to load, or null to skip loading
 */
export function useLoadProfile(profileName: string | null): void {
  const loadProfileSettings = useProfileSettingsStore((state) => state.load)
  const loadRoster = useRosterStore((state) => state.load)

  useEffect(() => {
    if (profileName) {
      // Load profile settings and roster in parallel
      void Promise.all([
        loadProfileSettings(profileName),
        loadRoster(profileName),
      ])
    }
  }, [profileName, loadProfileSettings, loadRoster])
}

/**
 * Hook to reload the current profile's data.
 * Returns a function that can be called to trigger a reload.
 */
export function useReloadProfile(): (profileName: string) => Promise<void> {
  const loadProfileSettings = useProfileSettingsStore((state) => state.load)
  const loadRoster = useRosterStore((state) => state.load)

  return async (profileName: string) => {
    await Promise.all([
      loadProfileSettings(profileName),
      loadRoster(profileName),
    ])
  }
}
