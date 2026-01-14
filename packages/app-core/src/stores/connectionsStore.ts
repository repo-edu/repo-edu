/**
 * Connections store - tracks connection verification status only.
 * Data lives in appSettingsStore; this store only tracks verification state.
 */

import { create } from "zustand"

type ConnectionStatus = "disconnected" | "verifying" | "connected" | "error"
type CourseStatus = "unknown" | "verifying" | "verified" | "failed"

interface ConnectionsState {
  lmsStatus: ConnectionStatus
  gitStatuses: Record<string, ConnectionStatus>
  lmsError: string | null
  gitErrors: Record<string, string | null>
  // Course verification status (per active profile)
  courseStatus: CourseStatus
  courseError: string | null
}

interface ConnectionsActions {
  // Direct status setters (used by ConnectionsSheet for verify operations)
  setLmsStatus: (status: ConnectionStatus, error: string | null) => void
  setGitStatus: (
    name: string,
    status: ConnectionStatus,
    error: string | null,
  ) => void

  // Course verification status
  setCourseStatus: (status: CourseStatus, error?: string | null) => void
  resetCourseStatus: () => void

  // Reset operations
  resetLmsStatus: () => void
  resetGitStatus: (name: string) => void
  resetAllStatuses: () => void

  // Cleanup operations (for orphan prevention)
  removeGitStatus: (name: string) => void
  renameGitStatus: (oldName: string, newName: string) => void
}

interface ConnectionsStore extends ConnectionsState, ConnectionsActions {}

const initialState: ConnectionsState = {
  lmsStatus: "disconnected",
  gitStatuses: {},
  lmsError: null,
  gitErrors: {},
  courseStatus: "unknown",
  courseError: null,
}

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  ...initialState,

  setLmsStatus: (status, error) => set({ lmsStatus: status, lmsError: error }),

  setGitStatus: (name, status, error) =>
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [name]: status },
      gitErrors: { ...state.gitErrors, [name]: error },
    })),

  setCourseStatus: (status, error = null) =>
    set({ courseStatus: status, courseError: error }),

  resetCourseStatus: () => set({ courseStatus: "unknown", courseError: null }),

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

  // Cleanup: completely remove a git status entry (used when connection is deleted)
  removeGitStatus: (name) =>
    set((state) => {
      const { [name]: _status, ...restStatuses } = state.gitStatuses
      const { [name]: _error, ...restErrors } = state.gitErrors
      return { gitStatuses: restStatuses, gitErrors: restErrors }
    }),

  // Cleanup: rename a git status entry (used when connection is renamed)
  renameGitStatus: (oldName, newName) =>
    set((state) => {
      const status = state.gitStatuses[oldName]
      const error = state.gitErrors[oldName]
      const { [oldName]: _status, ...restStatuses } = state.gitStatuses
      const { [oldName]: _error, ...restErrors } = state.gitErrors
      return {
        gitStatuses:
          status !== undefined
            ? { ...restStatuses, [newName]: status }
            : restStatuses,
        gitErrors:
          error !== undefined
            ? { ...restErrors, [newName]: error }
            : restErrors,
      }
    }),
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
export const selectCourseStatus = (state: ConnectionsStore) =>
  state.courseStatus
export const selectCourseError = (state: ConnectionsStore) => state.courseError
