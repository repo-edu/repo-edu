import {
  defaultAppCredentials,
  type PersistedAppCredentials,
  type PersistedGitConnection,
  type PersistedLlmConnection,
  type PersistedLmsConnection,
  resolveActiveGitConnection,
  resolveActiveLlmConnection,
} from "@repo-edu/domain/settings"
import { create } from "zustand"
import { useConnectionsStore } from "./connections-store.js"

type CredentialsState = {
  credentials: PersistedAppCredentials
}

type CredentialsActions = {
  hydrate: (credentials: PersistedAppCredentials) => void
  setActiveGitConnectionId: (id: string | null) => void

  addLmsConnection: (connection: PersistedLmsConnection) => void
  updateLmsConnection: (id: string, connection: PersistedLmsConnection) => void
  removeLmsConnection: (id: string) => void

  addGitConnection: (connection: PersistedGitConnection) => void
  updateGitConnection: (id: string, connection: PersistedGitConnection) => void
  removeGitConnection: (id: string) => void

  setActiveLlmConnectionId: (id: string | null) => void
  addLlmConnection: (connection: PersistedLlmConnection) => void
  updateLlmConnection: (id: string, connection: PersistedLlmConnection) => void
  removeLlmConnection: (id: string) => void

  reset: () => void
}

const initialState: CredentialsState = {
  credentials: defaultAppCredentials,
}

export const useCredentialsStore = create<
  CredentialsState & CredentialsActions
>((set) => ({
  ...initialState,

  hydrate: (credentials) => set({ credentials }),

  setActiveGitConnectionId: (id) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        activeGitConnectionId: id,
      },
    })),

  addLmsConnection: (connection) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        lmsConnections: [...state.credentials.lmsConnections, connection],
      },
    })),

  updateLmsConnection: (id, connection) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        lmsConnections: state.credentials.lmsConnections.map((lc) =>
          lc.id === id ? connection : lc,
        ),
      },
    })),

  removeLmsConnection: (id) => {
    set((state) => ({
      credentials: {
        ...state.credentials,
        lmsConnections: state.credentials.lmsConnections.filter(
          (lc) => lc.id !== id,
        ),
      },
    }))
    useConnectionsStore.getState().removeLmsConnectionStatus(id)
  },

  addGitConnection: (connection) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        gitConnections: [...state.credentials.gitConnections, connection],
      },
    })),

  updateGitConnection: (id, connection) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        gitConnections: state.credentials.gitConnections.map((gc) =>
          gc.id === id ? connection : gc,
        ),
      },
    })),

  removeGitConnection: (id) => {
    set((state) => ({
      credentials: {
        ...state.credentials,
        gitConnections: state.credentials.gitConnections.filter(
          (gc) => gc.id !== id,
        ),
        activeGitConnectionId:
          state.credentials.activeGitConnectionId === id
            ? null
            : state.credentials.activeGitConnectionId,
      },
    }))
    useConnectionsStore.getState().removeGitStatus(id)
  },

  setActiveLlmConnectionId: (id) =>
    set((state) => ({
      credentials: { ...state.credentials, activeLlmConnectionId: id },
    })),

  addLlmConnection: (connection) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        llmConnections: [...state.credentials.llmConnections, connection],
      },
    })),

  updateLlmConnection: (id, connection) =>
    set((state) => ({
      credentials: {
        ...state.credentials,
        llmConnections: state.credentials.llmConnections.map((lc) =>
          lc.id === id ? connection : lc,
        ),
      },
    })),

  removeLlmConnection: (id) => {
    set((state) => ({
      credentials: {
        ...state.credentials,
        llmConnections: state.credentials.llmConnections.filter(
          (lc) => lc.id !== id,
        ),
        activeLlmConnectionId:
          state.credentials.activeLlmConnectionId === id
            ? null
            : state.credentials.activeLlmConnectionId,
      },
    }))
    useConnectionsStore.getState().removeLlmStatus(id)
  },

  reset: () => set(initialState),
}))

export const selectLmsConnections = (state: CredentialsState) =>
  state.credentials.lmsConnections
export const selectGitConnections = (state: CredentialsState) =>
  state.credentials.gitConnections
export const selectGitConnection = (id: string) => (state: CredentialsState) =>
  state.credentials.gitConnections.find((gc) => gc.id === id) ?? null
export const selectActiveGitConnectionId = (state: CredentialsState) =>
  state.credentials.activeGitConnectionId
export const selectActiveGitConnection = (state: CredentialsState) =>
  resolveActiveGitConnection(state.credentials)
export const selectLlmConnections = (state: CredentialsState) =>
  state.credentials.llmConnections
export const selectActiveLlmConnectionId = (state: CredentialsState) =>
  state.credentials.activeLlmConnectionId
export const selectActiveLlmConnection = (state: CredentialsState) =>
  resolveActiveLlmConnection(state.credentials)
export const selectCredentialsSnapshot = (state: CredentialsState) =>
  state.credentials
