/**
 * Load profile hook - loads profile settings and roster when profile changes.
 *
 * Replaces useLoadSettings for the roster-centric design.
 */

import { useEffect, useRef } from "react"
import {
  loadProfileData,
  type ProfileLoadOptions,
  type ProfileLoadResult,
} from "../utils/profileLoader"

/**
 * Hook to load profile settings and roster when the profile name changes.
 *
 * @param profileName - The name of the profile to load, or null to skip loading
 * @param onResult - Optional callback invoked after profile data is loaded
 */
export function useLoadProfile(
  profileName: string | null,
  onResult?: (result: ProfileLoadResult) => void,
): void {
  const onResultRef = useRef(onResult)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    if (!profileName) return
    let cancelled = false

    void loadProfileData(profileName).then((result) => {
      if (cancelled || result.stale) return
      onResultRef.current?.(result)
    })

    return () => {
      cancelled = true
    }
  }, [profileName, loadProfileData])
}

/**
 * Hook to reload the current profile's data.
 * Returns a function that can be called to trigger a reload.
 */
export function useReloadProfile(): (
  profileName: string,
  options?: ProfileLoadOptions,
) => Promise<ProfileLoadResult> {
  return (profileName: string, options?: ProfileLoadOptions) =>
    loadProfileData(profileName, options)
}
