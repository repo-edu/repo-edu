/**
 * Load profile hook - loads profile settings and roster when profile changes.
 *
 * Replaces useLoadSettings for the roster-centric design.
 */

import { useEffect } from "react"
import { commands } from "../bindings/commands"
import { useAppSettingsStore } from "../stores/appSettingsStore"
import { useConnectionsStore } from "../stores/connectionsStore"
import { useOutputStore } from "../stores/outputStore"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"

/**
 * Hook to load profile settings and roster when the profile name changes.
 * Also auto-verifies the course if an LMS connection is configured.
 *
 * @param profileName - The name of the profile to load, or null to skip loading
 */
export function useLoadProfile(profileName: string | null): void {
  const loadProfileSettings = useProfileSettingsStore((state) => state.load)
  const loadRoster = useRosterStore((state) => state.load)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const setCourseStatus = useConnectionsStore((state) => state.setCourseStatus)
  const resetCourseStatus = useConnectionsStore(
    (state) => state.resetCourseStatus,
  )
  const setCourse = useProfileSettingsStore((state) => state.setCourse)
  const appendOutput = useOutputStore((state) => state.appendText)

  useEffect(() => {
    if (!profileName) return

    async function loadAndVerify() {
      // Reset course status before loading
      resetCourseStatus()

      // Load profile settings and roster in parallel
      await Promise.all([
        loadProfileSettings(profileName),
        loadRoster(profileName),
      ])

      // Auto-verify course if LMS is connected
      if (lmsConnection) {
        // Get the just-loaded course info
        const course = useProfileSettingsStore.getState().course
        if (course.id.trim()) {
          setCourseStatus("verifying")
          try {
            const result = await commands.verifyProfileCourse(profileName)
            if (result.status === "error") {
              setCourseStatus("failed", result.error.message)
              return
            }

            const { success, message, updated_name } = result.data
            if (!success) {
              setCourseStatus("failed", message)
              return
            }

            // Update course name if changed
            if (updated_name && updated_name !== course.name) {
              setCourse({ id: course.id, name: updated_name })
              appendOutput(`Course name updated: ${updated_name}`, "info")
            }

            setCourseStatus("verified")
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            setCourseStatus("failed", message)
          }
        }
      }
    }

    void loadAndVerify()
  }, [
    profileName,
    loadProfileSettings,
    loadRoster,
    lmsConnection,
    setCourseStatus,
    resetCourseStatus,
    setCourse,
    appendOutput,
  ])
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
