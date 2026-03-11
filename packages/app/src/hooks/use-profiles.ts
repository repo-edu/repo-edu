import type { PersistedProfile, Roster } from "@repo-edu/domain"
import { persistedProfileKind } from "@repo-edu/domain"
import { useCallback } from "react"
import {
  getWorkflowClient,
  useWorkflowClient,
} from "../contexts/workflow-client.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { generateProfileId } from "../utils/nanoid.js"

const EMPTY_ROSTER: Roster = {
  connection: null,
  students: [],
  staff: [],
  groups: [],
  groupSets: [],
  assignments: [],
}

export function useProfiles() {
  const profileList = useUiStore((s) => s.profileList)
  const loading = useUiStore((s) => s.profileListLoading)
  const client = useWorkflowClient()

  const refresh = useCallback(async () => {
    useUiStore.getState().setProfileListLoading(true)
    try {
      const list = await client.run("profile.list", undefined)
      useUiStore.getState().setProfileList(list)
      const activeProfileId = useUiStore.getState().activeProfileId
      if (
        activeProfileId !== null &&
        !list.some((profile) => profile.id === activeProfileId)
      ) {
        useUiStore.getState().setActiveProfileId(null)
        useAppSettingsStore.getState().setActiveProfileId(null)
        try {
          await useAppSettingsStore.getState().save()
        } catch {
          // Keep refresh resilient even if settings persistence fails.
        }
      }
    } finally {
      useUiStore.getState().setProfileListLoading(false)
    }
  }, [client])

  const switchProfile = useCallback(async (profileId: string) => {
    useUiStore.getState().setActiveProfileId(profileId)
    useAppSettingsStore.getState().setActiveProfileId(profileId)
    try {
      await useAppSettingsStore.getState().save()
    } catch {
      // Keep profile switching resilient even if settings persistence fails.
    }
  }, [])

  const duplicateProfile = useCallback(
    async (sourceId: string, displayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      try {
        const wfClient = getWorkflowClient()
        const source = await wfClient.run("profile.load", {
          profileId: sourceId,
        })

        const duplicate: PersistedProfile = {
          kind: persistedProfileKind,
          schemaVersion: source.schemaVersion,
          revision: 0,
          id: generateProfileId(),
          displayName,
          lmsConnectionName: source.lmsConnectionName,
          gitConnectionName: source.gitConnectionName,
          courseId: source.courseId,
          roster: EMPTY_ROSTER,
          repositoryTemplate: source.repositoryTemplate,
          updatedAt: new Date().toISOString(),
        }

        await wfClient.run("profile.save", duplicate)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to duplicate profile: ${message}`, {
          tone: "error",
        })
        return false
      }
    },
    [refresh],
  )

  const renameProfile = useCallback(
    async (profileId: string, newDisplayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      if (!newDisplayName.trim()) return false

      try {
        const wfClient = getWorkflowClient()
        const profile = await wfClient.run("profile.load", { profileId })

        const updated: PersistedProfile = {
          ...profile,
          displayName: newDisplayName.trim(),
        }

        await wfClient.run("profile.save", updated)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to rename profile: ${message}`, { tone: "error" })
        return false
      }
    },
    [refresh],
  )

  const deleteProfile = useCallback(
    async (profileId: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      const activeProfileId = useUiStore.getState().activeProfileId
      const profiles = useUiStore.getState().profileList
      const isActive = profileId === activeProfileId
      const remaining = profiles.filter((p) => p.id !== profileId)

      try {
        const wfClient = getWorkflowClient()
        await wfClient.run("profile.delete", { profileId })

        if (isActive) {
          if (remaining.length > 0) {
            await switchProfile(remaining[0].id)
          } else {
            useUiStore.getState().setActiveProfileId(null)
            useAppSettingsStore.getState().setActiveProfileId(null)
            try {
              await useAppSettingsStore.getState().save()
            } catch {
              // Keep delete resilient.
            }
          }
        }

        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to delete profile: ${message}`, { tone: "error" })
        return false
      }
    },
    [refresh, switchProfile],
  )

  return {
    profiles: profileList,
    loading,
    refresh,
    switchProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
  }
}
