import { useCallback, useEffect, useRef, useState } from "react";
import {
  selectProfileStatus,
  useProfileStore,
} from "../stores/profile-store.js";
import { hashSnapshot } from "../utils/snapshot.js";

/**
 * Tracks whether the current profile has unsaved changes using FNV-1a hashing.
 * Resets the baseline when the active profile changes or when `markClean` is called.
 */
export function useDirtyState(activeProfileId: string | null) {
  const [isDirty, setIsDirty] = useState(false);
  const baselineRef = useRef<number>(0);
  const profileStatus = useProfileStore(selectProfileStatus);
  const loadedProfileId = useProfileStore((state) => state.profile?.id ?? null);

  const computeHash = useCallback(() => {
    const profile = useProfileStore.getState().profile;
    if (!profile) return 0;
    return hashSnapshot({
      roster: profile.roster,
      courseId: profile.courseId,
      gitConnectionName: profile.gitConnectionName,
      lmsConnectionName: profile.lmsConnectionName,
      repositoryTemplate: profile.repositoryTemplate,
    });
  }, []);

  const markClean = useCallback(() => {
    baselineRef.current = computeHash();
    setIsDirty(false);
  }, [computeHash]);

  const forceDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  // Reset baseline only when the active profile is actually loaded.
  useEffect(() => {
    if (activeProfileId === null) {
      baselineRef.current = 0;
      setIsDirty(false);
      return;
    }

    if (profileStatus !== "loaded" || loadedProfileId !== activeProfileId) {
      return;
    }

    baselineRef.current = computeHash();
    setIsDirty(false);
  }, [activeProfileId, profileStatus, loadedProfileId, computeHash]);

  // Subscribe to profile store changes.
  useEffect(() => {
    const unsub = useProfileStore.subscribe(() => {
      const current = computeHash();
      setIsDirty(current !== baselineRef.current);
    });
    return unsub;
  }, [computeHash]);

  return { isDirty, markClean, forceDirty };
}
