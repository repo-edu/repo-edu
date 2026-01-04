/**
 * Connections store - tracks connection verification status only.
 * Data lives in appSettingsStore; this store only tracks verification state.
 */

import { create } from "zustand"
import type { GitConnection, LmsConnection } from "../bindings/types"

type ConnectionStatus = "disconnected" | "verifying" | "connected" | "error"

interface ConnectionsState {
  lmsStatus: ConnectionStatus
  gitStatuses: Record<string, ConnectionStatus>
  lmsError: string | null
  gitErrors: Record<string, string | null>
}

interface ConnectionsActions {
  // LMS verification
  verifyLms: (connection: LmsConnection) => Promise<void>
  verifyLmsDraft: (connection: LmsConnection) => Promise<void>
  resetLmsStatus: () => void

  // Git verification
  verifyGit: (name: string, connection: GitConnection) => Promise<void>
  verifyGitDraft: (connection: GitConnection) => Promise<void>
  resetGitStatus: (name: string) => void

  // Bulk operations
  resetAllStatuses: () => void
}

interface ConnectionsStore extends ConnectionsState, ConnectionsActions {}

const initialState: ConnectionsState = {
  lmsStatus: "disconnected",
  gitStatuses: {},
  lmsError: null,
  gitErrors: {},
}

export const useConnectionsStore = create<ConnectionsStore>((set, get) => ({
  ...initialState,

  // LMS verification - placeholder implementation
  // Will be connected to verify_lms_connection command when available
  verifyLms: async (_connection) => {
    set({ lmsStatus: "verifying", lmsError: null })
    try {
      // TODO: Connect to verify_lms_connection command when available
      // For now, simulate verification
      await new Promise((resolve) => setTimeout(resolve, 500))
      set({ lmsStatus: "connected", lmsError: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ lmsStatus: "error", lmsError: message })
    }
  },

  verifyLmsDraft: async (connection) => {
    // Same as verifyLms but for unsaved draft connections
    await get().verifyLms(connection)
  },

  resetLmsStatus: () => set({ lmsStatus: "disconnected", lmsError: null }),

  // Git verification - placeholder implementation
  // Will be connected to verify_git_connection command when available
  verifyGit: async (name, _connection) => {
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [name]: "verifying" },
      gitErrors: { ...state.gitErrors, [name]: null },
    }))
    try {
      // TODO: Connect to verify_git_connection command when available
      // For now, simulate verification
      await new Promise((resolve) => setTimeout(resolve, 500))
      set((state) => ({
        gitStatuses: { ...state.gitStatuses, [name]: "connected" },
        gitErrors: { ...state.gitErrors, [name]: null },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set((state) => ({
        gitStatuses: { ...state.gitStatuses, [name]: "error" },
        gitErrors: { ...state.gitErrors, [name]: message },
      }))
    }
  },

  verifyGitDraft: async (_connection) => {
    // Verify a draft connection (not yet saved)
    // Use a temporary name for status tracking
    const tempName = "_draft"
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [tempName]: "verifying" },
      gitErrors: { ...state.gitErrors, [tempName]: null },
    }))
    try {
      // TODO: Connect to verify_git_connection_draft command when available
      await new Promise((resolve) => setTimeout(resolve, 500))
      set((state) => ({
        gitStatuses: { ...state.gitStatuses, [tempName]: "connected" },
        gitErrors: { ...state.gitErrors, [tempName]: null },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set((state) => ({
        gitStatuses: { ...state.gitStatuses, [tempName]: "error" },
        gitErrors: { ...state.gitErrors, [tempName]: message },
      }))
    }
  },

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
