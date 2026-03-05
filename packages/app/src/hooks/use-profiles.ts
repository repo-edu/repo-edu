import { useCallback } from "react";
import { useUiStore } from "../stores/ui-store.js";
import { useWorkflowClient } from "../contexts/workflow-client.js";
import { useAppSettingsStore } from "../stores/app-settings-store.js";

export function useProfiles() {
  const profileList = useUiStore((s) => s.profileList);
  const loading = useUiStore((s) => s.profileListLoading);
  const client = useWorkflowClient();

  const refresh = useCallback(async () => {
    useUiStore.getState().setProfileListLoading(true);
    try {
      const list = await client.run("profile.list", undefined);
      useUiStore.getState().setProfileList(list);
    } finally {
      useUiStore.getState().setProfileListLoading(false);
    }
  }, [client]);

  const switchProfile = useCallback(
    async (profileId: string) => {
      useUiStore.getState().setActiveProfileId(profileId);
      useAppSettingsStore.getState().setActiveProfileId(profileId);
      try {
        await useAppSettingsStore.getState().save();
      } catch {
        // Keep profile switching resilient even if settings persistence fails.
      }
    },
    [],
  );

  return {
    profiles: profileList,
    loading,
    refresh,
    switchProfile,
  };
}
