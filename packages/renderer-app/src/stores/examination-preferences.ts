import type { LlmProviderKind } from "@repo-edu/domain/connection"
import {
  selectActiveLlmConnection,
  selectLlmConnections,
} from "../session/selectors.js"
import {
  getSessionController,
  useSessionControllerSelector,
} from "../session/session-controller-context.js"
import type { SessionControllerSnapshot } from "../session/session-reducer.js"

export type ExaminationPreferenceSnapshot = {
  connections: ReturnType<typeof selectLlmConnections>
  activeConnection: ReturnType<typeof selectActiveLlmConnection>
  activeConnectionId: string | null
  examinationModelsByProvider: SessionControllerSnapshot["settings"]["preferences"]["examinationModelsByProvider"]
}

export function selectExaminationPreferenceSnapshot(
  state: SessionControllerSnapshot,
): ExaminationPreferenceSnapshot {
  return {
    connections: selectLlmConnections(state),
    activeConnection: selectActiveLlmConnection(state),
    activeConnectionId: state.settings.credentials.activeLlmConnectionId,
    examinationModelsByProvider:
      state.settings.preferences.examinationModelsByProvider,
  }
}

export function useExaminationPreferenceSnapshot(): ExaminationPreferenceSnapshot {
  const settings = useSessionControllerSelector((state) => state.settings)
  return selectExaminationPreferenceSnapshot({
    ...getSessionController().getSnapshot(),
    settings,
  })
}

export const examinationPreferencePersistence = {
  getSnapshot(): ExaminationPreferenceSnapshot {
    return selectExaminationPreferenceSnapshot(
      getSessionController().getSnapshot(),
    )
  },

  persistActiveConnection(activeConnectionId: string | null): void {
    getSessionController().setActiveLlmConnectionId(activeConnectionId)
  },

  persistModel(provider: LlmProviderKind, modelCode: string): void {
    getSessionController().setExaminationModelForProvider(provider, modelCode)
  },
}
