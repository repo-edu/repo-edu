/**
 * useProfiles - Hook for managing profile list and profile operations.
 * Reads from uiStore cache to avoid fetching on every tab switch.
 */

import type { ProfileSettings } from "@repo-edu/backend-interface/types"
import { useCallback, useEffect } from "react"
import { commands } from "../bindings/commands"
import { useOutputStore } from "../stores/outputStore"
import { useProfileStore } from "../stores/profileStore"
import { type ProfileListItem, useUiStore } from "../stores/uiStore"

export type { ProfileListItem as ProfileItem }

export interface UseProfilesReturn {
  profiles: ProfileListItem[]
  loading: boolean
  refresh: () => Promise<void>
  switchProfile: (name: string) => Promise<void>
  duplicateProfile: (
    sourceName: string,
    newName: string,
    courseId: string,
    courseName: string,
  ) => Promise<boolean>
  renameProfile: (oldName: string, newName: string) => Promise<boolean>
  deleteProfile: (name: string) => Promise<boolean>
}

export function useProfiles(): UseProfilesReturn {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const setActiveProfile = useUiStore((state) => state.setActiveProfile)
  const profileStatus = useProfileStore((state) => state.status)
  const appendOutput = useOutputStore((state) => state.appendText)
  const course = useProfileStore(
    (state) => state.document?.settings.course ?? null,
  )

  // Read from store cache
  const profiles = useUiStore((state) => state.profileList)
  const loading = useUiStore((state) => state.profileListLoading)
  const setProfileList = useUiStore((state) => state.setProfileList)
  const setProfileListLoading = useUiStore(
    (state) => state.setProfileListLoading,
  )

  const refresh = useCallback(async () => {
    setProfileListLoading(true)
    try {
      const result = await commands.listProfiles()
      if (result.status === "ok") {
        const profileNames = result.data

        // Fetch course names for all profiles
        const profilesWithCourses: ProfileListItem[] = await Promise.all(
          profileNames.map(async (name) => {
            try {
              const res = await commands.loadProfileSettings(name)
              if (res.status === "ok") {
                return {
                  name,
                  courseName:
                    res.data.settings.course.name || "No connected course",
                }
              }
            } catch (e) {
              console.error(`Failed to load course for profile ${name}:`, e)
            }
            return { name, courseName: "No connected course" }
          }),
        )
        setProfileList(profilesWithCourses)
      }
    } catch (error) {
      console.error("Failed to load profiles:", error)
    } finally {
      setProfileListLoading(false)
    }
  }, [setProfileList, setProfileListLoading])

  // Load profiles on first mount if not already loaded
  useEffect(() => {
    if (profiles.length === 0 && !loading) {
      refresh()
    }
  }, [profiles.length, loading, refresh])

  // Ensure the active profile is in the list (handles auto-created profiles)
  useEffect(() => {
    if (
      activeProfile &&
      profileStatus === "loaded" &&
      profiles.length > 0 &&
      !profiles.some((p) => p.name === activeProfile)
    ) {
      refresh()
    }
  }, [activeProfile, profileStatus, profiles, refresh])

  // Update course name for active profile when it changes
  useEffect(() => {
    if (activeProfile && course?.name && profiles.length > 0) {
      const currentProfile = profiles.find((p) => p.name === activeProfile)
      if (currentProfile && currentProfile.courseName !== course.name) {
        setProfileList(
          profiles.map((p) =>
            p.name === activeProfile ? { ...p, courseName: course.name } : p,
          ),
        )
      }
    }
  }, [activeProfile, course?.name, profiles, setProfileList])

  const switchProfile = useCallback(
    async (name: string) => {
      try {
        const result = await commands.setActiveProfile(name)
        if (result.status === "ok") {
          setActiveProfile(name)
        } else {
          appendOutput(
            `Failed to switch profile: ${result.error.message}`,
            "error",
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        appendOutput(`Failed to switch profile: ${message}`, "error")
      }
    },
    [setActiveProfile, appendOutput],
  )

  const duplicateProfile = useCallback(
    async (
      sourceName: string,
      newName: string,
      courseId: string,
      courseName: string,
    ): Promise<boolean> => {
      try {
        // Load source profile settings
        const loadResult = await commands.loadProfileSettings(sourceName)
        if (loadResult.status === "error") {
          appendOutput(
            `Failed to load source profile: ${loadResult.error.message}`,
            "error",
          )
          return false
        }

        // Create new profile settings with new course, keeping other settings
        const sourceSettings = loadResult.data.settings
        const newSettings: ProfileSettings = {
          course: { id: courseId.trim(), name: courseName.trim() },
          git_connection: sourceSettings.git_connection,
          operations: sourceSettings.operations,
          exports: sourceSettings.exports,
        }

        // Save as new profile (roster is not copied - new profile starts with empty roster)
        const saveResult = await commands.saveProfile(
          newName.trim(),
          newSettings,
        )
        if (saveResult.status === "error") {
          appendOutput(
            `Failed to create profile: ${saveResult.error.message}`,
            "error",
          )
          return false
        }

        await refresh()
        appendOutput(
          `Duplicated "${sourceName}" to "${newName.trim()}" with course ${courseId.trim()}`,
          "success",
        )
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        appendOutput(`Failed to duplicate profile: ${message}`, "error")
        return false
      }
    },
    [appendOutput, refresh],
  )

  const renameProfile = useCallback(
    async (oldName: string, newName: string): Promise<boolean> => {
      if (!newName.trim() || newName === oldName) {
        return false
      }

      try {
        const result = await commands.renameProfile(oldName, newName.trim())
        if (result.status === "ok") {
          appendOutput(
            `Renamed profile: ${oldName} → ${newName.trim()}`,
            "success",
          )
          // If we renamed the active profile, update it
          if (oldName === activeProfile) {
            setActiveProfile(newName.trim())
          }
          await refresh()
          return true
        }
        appendOutput(
          `Failed to rename profile: ${result.error.message}`,
          "error",
        )
        return false
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        appendOutput(`Failed to rename profile: ${message}`, "error")
        return false
      }
    },
    [activeProfile, setActiveProfile, appendOutput, refresh],
  )

  const deleteProfile = useCallback(
    async (profileName: string): Promise<boolean> => {
      const isActive = profileName === activeProfile
      const otherProfiles = profiles.filter((p) => p.name !== profileName)

      try {
        const result = await commands.deleteProfile(profileName)
        if (result.status === "ok") {
          appendOutput(`Deleted profile: ${profileName}`, "success")

          if (isActive) {
            if (otherProfiles.length > 0) {
              // Switch to another existing profile
              const nextProfile = otherProfiles[0].name
              await commands.setActiveProfile(nextProfile)
              setActiveProfile(nextProfile)
            } else {
              // No profiles left — clear active profile
              setActiveProfile(null)
            }
          }
          await refresh()
          return true
        }
        appendOutput(
          `Failed to delete profile: ${result.error.message}`,
          "error",
        )
        return false
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        appendOutput(`Failed to delete profile: ${message}`, "error")
        return false
      }
    },
    [activeProfile, profiles, setActiveProfile, appendOutput, refresh],
  )

  return {
    profiles,
    loading,
    refresh,
    switchProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
  }
}
