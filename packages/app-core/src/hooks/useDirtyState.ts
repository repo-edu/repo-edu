/**
 * Dirty state tracking hook - tracks whether profile document has changed.
 *
 * Uses hash-based comparison for efficient dirty checking without deep equality.
 * Provides methods to mark state as clean (after save) or reset baseline.
 *
 * Tracks changes to:
 * - gitConnection (settings)
 * - courseVerifiedAt (settings)
 * - operations (settings)
 * - exports (settings)
 * - roster (students, assignments, groups)
 *
 * Does NOT track:
 * - course (immutable after profile creation)
 * - appSettings (auto-saved separately)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useProfileStore } from "../stores/profileStore"
import { hashSnapshot } from "../utils/snapshot"

export interface DirtyStateHashes {
  /** Combined hash of document state */
  document: number
  /** Profile name the baseline was captured for */
  profileName: string | null
}

export interface UseDirtyStateReturn {
  /** Whether profile document has unsaved changes */
  isDirty: boolean
  /** Update baseline hashes (call after saving) */
  markClean: () => void
  /** Force dirty state by invalidating baselines */
  forceDirty: () => void
}

/**
 * Get saveable document state (excludes course which is immutable)
 */
function getSaveableDocumentState() {
  const state = useProfileStore.getState()
  if (!state.document) return null
  return {
    gitConnection: state.document.settings.git_connection,
    courseVerifiedAt: state.document.settings.course_verified_at,
    operations: state.document.settings.operations,
    exports: state.document.settings.exports,
    roster: state.document.roster,
  }
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
    document: hashSnapshot(getSaveableDocumentState()),
    profileName: activeProfile,
  }))

  // Subscribe to relevant document fields from profileStore
  const document = useProfileStore((state) => state.document)

  // Compute current hash consistently with getSaveableDocumentState
  // When document is null, both baseline and current should hash `null`
  const currentState = document
    ? {
        gitConnection: document.settings.git_connection,
        courseVerifiedAt: document.settings.course_verified_at,
        operations: document.settings.operations,
        exports: document.settings.exports,
        roster: document.roster,
      }
    : null
  const currentHash = hashSnapshot(currentState)

  // Track the previous profile to detect switches
  const prevProfileRef = useRef(activeProfile)

  const updateBaseline = useCallback((profileName: string | null) => {
    setBaseline({
      document: hashSnapshot(getSaveableDocumentState()),
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
  const isDirty = baselineMatchesProfile && currentHash !== baseline.document

  // markClean is stable (empty deps) - updates baseline snapshot
  const markClean = useCallback(() => {
    updateBaseline(prevProfileRef.current)
  }, [updateBaseline])

  // forceDirty is stable (empty deps) - invalidates baseline snapshot
  const forceDirty = useCallback(() => {
    setBaseline({
      document: 0,
      profileName: prevProfileRef.current,
    })
  }, [])

  return {
    isDirty,
    markClean,
    forceDirty,
  }
}
