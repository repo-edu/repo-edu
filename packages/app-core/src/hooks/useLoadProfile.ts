/**
 * Load profile hook - loads profile document when profile changes.
 *
 * Uses the unified profileStore.load() which atomically loads both
 * settings and roster, resolves identity mode, and triggers validation.
 */

import { useEffect, useRef } from "react"
import { type ProfileLoadResult, useProfileStore } from "../stores/profileStore"

/**
 * Hook to load profile document when the profile name changes.
 *
 * @param profileName - The name of the profile to load, or null to skip loading
 * @param onResult - Optional callback invoked after profile data is loaded
 */
export function useLoadProfile(
  profileName: string | null,
  onResult?: (result: ProfileLoadResult) => void,
): void {
  const onResultRef = useRef(onResult)
  const load = useProfileStore((state) => state.load)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    if (!profileName) return
    let cancelled = false

    void load(profileName).then((result) => {
      if (cancelled || result.stale) return
      onResultRef.current?.(result)
    })

    return () => {
      cancelled = true
    }
  }, [profileName, load])
}

/**
 * Hook to reload the current profile's data.
 * Returns a function that can be called to trigger a reload.
 */
export function useReloadProfile(): (
  profileName: string,
) => Promise<ProfileLoadResult> {
  const load = useProfileStore((state) => state.load)
  return load
}

// Re-export ProfileLoadResult for convenience
export type { ProfileLoadResult }
