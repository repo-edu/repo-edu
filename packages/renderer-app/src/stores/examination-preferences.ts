import type { LlmProviderKind } from "@repo-edu/domain/settings"
import { useShallow } from "zustand/react/shallow"
import {
  selectExaminationModelsByProvider,
  useAppSettingsStore,
} from "./app-settings-store.js"
import {
  selectActiveLlmConnection,
  selectLlmConnections,
  useCredentialsStore,
} from "./credentials-store.js"

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
  examinationModelsByProvider: ReturnType<
    typeof selectExaminationModelsByProvider
  >,
): ExaminationPreferenceSnapshot {
  return {
    connections: selectLlmConnections(state),
    activeConnection: selectActiveLlmConnection(state),
    activeConnectionId: state.credentials.activeLlmConnectionId,
    examinationModelsByProvider,
  }
}

export function useExaminationPreferenceSnapshot(): ExaminationPreferenceSnapshot {
  const credentialSnapshot = useCredentialsStore(
    useShallow((state) => ({
      connections: selectLlmConnections(state),
      activeConnection: selectActiveLlmConnection(state),
      activeConnectionId: state.credentials.activeLlmConnectionId,
    })),
  )
  const examinationModelsByProvider = useAppSettingsStore(
    selectExaminationModelsByProvider,
  )
  return {
    ...credentialSnapshot,
    examinationModelsByProvider,
  }
}

export const examinationPreferencePersistence = {
  getSnapshot(): ExaminationPreferenceSnapshot {
    return selectExaminationPreferenceSnapshot(
      useCredentialsStore.getState(),
      selectExaminationModelsByProvider(useAppSettingsStore.getState()),
    )
  },

  persistActiveConnection(activeConnectionId: string | null): void {
    const settings = useCredentialsStore.getState()
    settings.setActiveLlmConnectionId(activeConnectionId)
  },

  persistModel(provider: LlmProviderKind, modelCode: string): void {
    const settings = useAppSettingsStore.getState()
    settings.setExaminationModelForProvider(provider, modelCode)
  },
}
