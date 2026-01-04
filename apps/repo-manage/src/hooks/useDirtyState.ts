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

import { useCallback, useRef } from "react"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"
import { hashSnapshot } from "../utils/snapshot"

export interface DirtyStateHashes {
  profileSettings: number
  roster: number
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
 */
export function useDirtyState(): UseDirtyStateReturn {
  // Use refs to track baseline hashes
  const lastSavedHashesRef = useRef<DirtyStateHashes>({
    profileSettings: hashSnapshot(getSaveableProfileState()),
    roster: hashSnapshot(getRosterState()),
  })

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

  // Compare current state to baseline
  const isDirty =
    currentProfileHash !== lastSavedHashesRef.current.profileSettings ||
    currentRosterHash !== lastSavedHashesRef.current.roster

  const markClean = useCallback(() => {
    lastSavedHashesRef.current = {
      profileSettings: hashSnapshot(getSaveableProfileState()),
      roster: hashSnapshot(getRosterState()),
    }
  }, [])

  const forceDirty = useCallback(() => {
    lastSavedHashesRef.current = {
      profileSettings: 0,
      roster: 0,
    }
  }, [])

  return {
    isDirty,
    markClean,
    forceDirty,
  }
}
