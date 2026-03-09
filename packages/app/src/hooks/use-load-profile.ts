import { useEffect, useRef } from "react"
import { useProfileStore } from "../stores/profile-store.js"

/**
 * Loads a profile into the profile store when `profileId` changes.
 * Ignores stale results if the profile changed before loading completed.
 */
export function useLoadProfile(profileId: string | null): void {
  const loadIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!profileId) {
      useProfileStore.getState().clear()
      loadIdRef.current = null
      return
    }

    loadIdRef.current = profileId
    void useProfileStore.getState().load(profileId)
  }, [profileId])
}
