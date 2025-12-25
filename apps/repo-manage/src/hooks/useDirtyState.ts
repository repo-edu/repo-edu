/**
 * Dirty state tracking hook - tracks whether form state has changed from baseline
 *
 * Uses hash-based comparison for efficient dirty checking without deep equality.
 * Provides methods to mark state as clean (after save) or reset baseline.
 */

import { useCallback, useState } from "react"
import { hashSnapshot } from "../utils/snapshot"

export interface DirtyStateHashes {
  lms: number
  repo: number
}

export interface UseDirtyStateOptions {
  /** Get current LMS form state */
  getLmsState: () => unknown
  /** Get current repo form state */
  getRepoState: () => unknown
}

export interface UseDirtyStateReturn {
  /** Whether any form has unsaved changes */
  isDirty: boolean
  /** Current baseline hashes */
  lastSavedHashes: DirtyStateHashes
  /** Update baseline hashes (call after saving) */
  markClean: () => void
  /** Set specific baseline hashes (for external control) */
  setBaselines: (hashes: DirtyStateHashes) => void
  /** Force dirty state by invalidating baselines */
  forceDirty: () => void
}

/**
 * Hook to track dirty state using hash comparison
 */
export function useDirtyState(
  options: UseDirtyStateOptions,
): UseDirtyStateReturn {
  const { getLmsState, getRepoState } = options

  const [lastSavedHashes, setLastSavedHashes] = useState<DirtyStateHashes>(
    () => ({
      lms: hashSnapshot(getLmsState()),
      repo: hashSnapshot(getRepoState()),
    }),
  )

  // Simple dirty check - compare current hashes to baseline
  const isDirty =
    hashSnapshot(getLmsState()) !== lastSavedHashes.lms ||
    hashSnapshot(getRepoState()) !== lastSavedHashes.repo

  const markClean = useCallback(() => {
    setLastSavedHashes({
      lms: hashSnapshot(getLmsState()),
      repo: hashSnapshot(getRepoState()),
    })
  }, [getLmsState, getRepoState])

  const setBaselines = useCallback((hashes: DirtyStateHashes) => {
    setLastSavedHashes(hashes)
  }, [])

  const forceDirty = useCallback(() => {
    setLastSavedHashes({ lms: 0, repo: 0 })
  }, [])

  return {
    isDirty,
    lastSavedHashes,
    markClean,
    setBaselines,
    forceDirty,
  }
}
