/**
 * App-level settings store.
 * Holds theme, LMS connection, and named git connections.
 * These are global settings shared across all profiles.
 */

import { create } from "zustand"
import { commands } from "../bindings/commands"
import type {
  AppSettings,
  GitConnection,
  LmsConnection,
  LogSettings,
  Theme,
} from "../bindings/types"

type StoreStatus = "loading" | "loaded" | "saving" | "error"

interface AppSettingsState {
  theme: Theme
  lmsConnection: LmsConnection | null
  gitConnections: Record<string, GitConnection>
  logging: LogSettings
  status: StoreStatus
  error: string | null
}

interface AppSettingsActions {
  // Loading and saving
  load: () => Promise<void>
  save: () => Promise<void>

  // Theme
  setTheme: (theme: Theme) => void

  // LMS connection
  setLmsConnection: (connection: LmsConnection | null) => void

  // Git connections (CRUD)
  addGitConnection: (name: string, connection: GitConnection) => void
  updateGitConnection: (name: string, connection: GitConnection) => void
  removeGitConnection: (name: string) => void

  // Logging
  setLogging: (logging: LogSettings) => void

  // Reset
  reset: () => void
}

interface AppSettingsStore extends AppSettingsState, AppSettingsActions {}

const initialState: AppSettingsState = {
  theme: "system",
  lmsConnection: null,
  gitConnections: {},
  logging: {
    info: true,
    debug: false,
    warning: true,
    error: true,
  },
  status: "loading",
  error: null,
}

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ status: "loading", error: null })
    try {
      const result = await commands.loadAppSettings()
      if (result.status === "error") {
        set({ status: "error", error: result.error.message })
        return
      }
      const settings = result.data
      set({
        theme: settings.theme,
        lmsConnection: settings.lms_connection ?? null,
        gitConnections: settings.git_connections ?? {},
        logging: settings.logging,
        status: "loaded",
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ status: "error", error: message })
    }
  },

  save: async () => {
    const state = get()
    set({ status: "saving", error: null })
    try {
      const settings: AppSettings = {
        theme: state.theme,
        lms_connection: state.lmsConnection,
        git_connections: state.gitConnections,
        logging: state.logging,
      }
      const result = await commands.saveAppSettings(settings)
      if (result.status === "error") {
        set({ status: "error", error: result.error.message })
        return
      }
      set({ status: "loaded", error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ status: "error", error: message })
    }
  },

  setTheme: (theme) => set({ theme }),

  setLmsConnection: (connection) => set({ lmsConnection: connection }),

  addGitConnection: (name, connection) =>
    set((state) => ({
      gitConnections: { ...state.gitConnections, [name]: connection },
    })),

  updateGitConnection: (name, connection) =>
    set((state) => ({
      gitConnections: { ...state.gitConnections, [name]: connection },
    })),

  removeGitConnection: (name) =>
    set((state) => {
      const { [name]: _, ...rest } = state.gitConnections
      return { gitConnections: rest }
    }),

  setLogging: (logging) => set({ logging }),

  reset: () => set(initialState),
}))

// Selector helpers
export const selectTheme = (state: AppSettingsStore) => state.theme
export const selectLmsConnection = (state: AppSettingsStore) =>
  state.lmsConnection
export const selectGitConnections = (state: AppSettingsStore) =>
  state.gitConnections
export const selectGitConnection =
  (name: string) => (state: AppSettingsStore) =>
    state.gitConnections[name] ?? null
export const selectLogging = (state: AppSettingsStore) => state.logging
export const selectAppSettingsStatus = (state: AppSettingsStore) => state.status
export const selectAppSettingsError = (state: AppSettingsStore) => state.error
