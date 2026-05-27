import type { LlmProviderKind } from "@repo-edu/domain/settings"
import { useShallow } from "zustand/react/shallow"
import {
  selectActiveLlmConnection,
  selectExaminationModelsByProvider,
  selectLlmConnections,
  useAppSettingsStore,
} from "./app-settings-store.js"

export type ExaminationPreferenceSnapshot = {
  connections: ReturnType<typeof selectLlmConnections>
  activeConnection: ReturnType<typeof selectActiveLlmConnection>
  activeConnectionId: string | null
  examinationModelsByProvider: ReturnType<
    typeof selectExaminationModelsByProvider
  >
}

export function selectExaminationPreferenceSnapshot(
  state: Parameters<typeof selectLlmConnections>[0],
): ExaminationPreferenceSnapshot {
  return {
    connections: selectLlmConnections(state),
    activeConnection: selectActiveLlmConnection(state),
    activeConnectionId: state.settings.activeLlmConnectionId,
    examinationModelsByProvider: selectExaminationModelsByProvider(state),
  }
}

export function useExaminationPreferenceSnapshot(): ExaminationPreferenceSnapshot {
  return useAppSettingsStore(useShallow(selectExaminationPreferenceSnapshot))
}

export const examinationPreferencePersistence = {
  getSnapshot(): ExaminationPreferenceSnapshot {
    return selectExaminationPreferenceSnapshot(useAppSettingsStore.getState())
  },

  persistActiveConnection(activeConnectionId: string | null): void {
    const settings = useAppSettingsStore.getState()
    settings.setActiveLlmConnectionId(activeConnectionId)
  },

  persistModel(provider: LlmProviderKind, modelCode: string): void {
    const settings = useAppSettingsStore.getState()
    settings.setExaminationModelForProvider(provider, modelCode)
  },
}
