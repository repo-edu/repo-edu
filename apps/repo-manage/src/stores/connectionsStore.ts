/**
 * Connections store - tracks connection verification status only.
 * Data lives in appSettingsStore; this store only tracks verification state.
 */

import { create } from "zustand"

type ConnectionStatus = "disconnected" | "verifying" | "connected" | "error"

interface ConnectionsState {
  lmsStatus: ConnectionStatus
  gitStatuses: Record<string, ConnectionStatus>
  lmsError: string | null
  gitErrors: Record<string, string | null>
}

interface ConnectionsActions {
  // Direct status setters (used by ConnectionsSheet for verify operations)
  setLmsStatus: (status: ConnectionStatus, error: string | null) => void
  setGitStatus: (
    name: string,
    status: ConnectionStatus,
    error: string | null,
  ) => void

  // Reset operations
  resetLmsStatus: () => void
  resetGitStatus: (name: string) => void
  resetAllStatuses: () => void
}

interface ConnectionsStore extends ConnectionsState, ConnectionsActions {}

const initialState: ConnectionsState = {
  lmsStatus: "disconnected",
  gitStatuses: {},
  lmsError: null,
  gitErrors: {},
}

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  ...initialState,

  setLmsStatus: (status, error) => set({ lmsStatus: status, lmsError: error }),

  setGitStatus: (name, status, error) =>
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [name]: status },
      gitErrors: { ...state.gitErrors, [name]: error },
    })),

  resetLmsStatus: () => set({ lmsStatus: "disconnected", lmsError: null }),

  resetGitStatus: (name) =>
    set((state) => {
      const { [name]: _, ...restStatuses } = state.gitStatuses
      const { [name]: __, ...restErrors } = state.gitErrors
      return {
        gitStatuses: { ...restStatuses, [name]: "disconnected" },
        gitErrors: { ...restErrors, [name]: null },
      }
    }),

  resetAllStatuses: () => set(initialState),
}))

// Selector helpers
export const selectLmsStatus = (state: ConnectionsStore) => state.lmsStatus
export const selectLmsError = (state: ConnectionsStore) => state.lmsError
export const selectGitStatuses = (state: ConnectionsStore) => state.gitStatuses
export const selectGitStatus = (name: string) => (state: ConnectionsStore) =>
  state.gitStatuses[name] ?? "disconnected"
export const selectGitErrors = (state: ConnectionsStore) => state.gitErrors
export const selectGitError = (name: string) => (state: ConnectionsStore) =>
  state.gitErrors[name] ?? null
