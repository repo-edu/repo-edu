/**
 * Dirty state tracking hook - tracks whether profile/roster state has changed.
 *
 * Uses hash-based comparison for efficient dirty checking without deep equality.
 * Provides methods to mark state as clean (after save) or reset baseline.
 *
 * Tracks:
 * - profileSettingsStore changes (gitConnection, operations, exports)
 * - rosterStore changes (students, assignments, groups)
 *
 * Does NOT track:
 * - course (immutable after profile creation)
 * - appSettings (auto-saved separately)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"
import { hashSnapshot } from "../utils/snapshot"

export interface DirtyStateHashes {
  profileSettings: number
  roster: number
  /** Profile name the baseline was captured for */
  profileName: string | null
}

export interface UseDirtyStateReturn {
  /** Whether profile or roster has unsaved changes */
  isDirty: boolean
  /** Update baseline hashes (call after saving) */
  markClean: () => void
  /** Force dirty state by invalidating baselines */
  forceDirty: () => void
}

/**
 * Get saveable profile settings state (excludes course which is immutable)
 */
function getSaveableProfileState() {
  const state = useProfileSettingsStore.getState()
  return {
    gitConnection: state.gitConnection,
    operations: state.operations,
    exports: state.exports,
  }
}

/**
 * Get roster state for dirty tracking
 */
function getRosterState() {
  const state = useRosterStore.getState()
  return state.roster
}

/**
 * Hook to track dirty state using hash comparison
 *
 * @param activeProfile - The currently active profile name (used to detect profile switches)
 */
export function useDirtyState(
  activeProfile: string | null,
): UseDirtyStateReturn {
  // Use state for baseline hashes so updates trigger a rerender
  const [baseline, setBaseline] = useState<DirtyStateHashes>(() => ({
    profileSettings: hashSnapshot(getSaveableProfileState()),
    roster: hashSnapshot(getRosterState()),
    profileName: activeProfile,
  }))

  // Get current state from stores
  const gitConnection = useProfileSettingsStore((state) => state.gitConnection)
  const operations = useProfileSettingsStore((state) => state.operations)
  const exports = useProfileSettingsStore((state) => state.exports)
  const roster = useRosterStore((state) => state.roster)

  // Compute current hashes
  const currentProfileHash = hashSnapshot({
    gitConnection,
    operations,
    exports,
  })
  const currentRosterHash = hashSnapshot(roster)

  // Track the previous profile to detect switches
  const prevProfileRef = useRef(activeProfile)

  const updateBaseline = useCallback((profileName: string | null) => {
    setBaseline({
      profileSettings: hashSnapshot(getSaveableProfileState()),
      roster: hashSnapshot(getRosterState()),
      profileName,
    })
  }, [])

  // Reset baseline association when profile changes (wait for explicit clean/dirty)
  useEffect(() => {
    if (prevProfileRef.current !== activeProfile) {
      prevProfileRef.current = activeProfile
      setBaseline((current) => ({
        ...current,
        profileName: null,
      }))
    }
  }, [activeProfile])

  // Compare current state to baseline, but only if baseline is for current profile
  // During profile switches, the baseline's profileName won't match, so isDirty = false
  const baselineMatchesProfile = baseline.profileName === activeProfile
  const isDirty =
    baselineMatchesProfile &&
    (currentProfileHash !== baseline.profileSettings ||
      currentRosterHash !== baseline.roster)

  // markClean is stable (empty deps) - updates baseline snapshot
  const markClean = useCallback(() => {
    updateBaseline(prevProfileRef.current)
  }, [updateBaseline])

  // forceDirty is stable (empty deps) - invalidates baseline snapshot
  const forceDirty = useCallback(() => {
    setBaseline({
      profileSettings: 0,
      roster: 0,
      profileName: prevProfileRef.current,
    })
  }, [])

  return {
    isDirty,
    markClean,
    forceDirty,
  }
}
