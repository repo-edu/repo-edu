/**
 * App-level settings store.
 * Holds theme, LMS connection, and named git connections.
 * These are global settings shared across all profiles.
 */

import type {
  AppSettings,
  DateFormat,
  GitConnection,
  LmsConnection,
  Theme,
  TimeFormat,
} from "@repo-edu/backend-interface/types"
import { create } from "zustand"
import { commands } from "../bindings/commands"
import { useConnectionsStore } from "./connectionsStore"

type StoreStatus = "loading" | "loaded" | "saving" | "error"

interface AppSettingsState {
  theme: Theme
  dateFormat: DateFormat
  timeFormat: TimeFormat
  lmsConnection: LmsConnection | null
  gitConnections: Record<string, GitConnection>
  status: StoreStatus
  error: string | null
}

interface AppSettingsActions {
  // Loading and saving
  load: () => Promise<void>
  save: () => Promise<void>

  // Display settings
  setTheme: (theme: Theme) => void
  setDateFormat: (format: DateFormat) => void
  setTimeFormat: (format: TimeFormat) => void

  // LMS connection
  setLmsConnection: (connection: LmsConnection | null) => void

  // Git connections (CRUD)
  addGitConnection: (name: string, connection: GitConnection) => void
  updateGitConnection: (name: string, connection: GitConnection) => void
  renameGitConnection: (
    oldName: string,
    newName: string,
    connection: GitConnection,
  ) => void
  removeGitConnection: (name: string) => void

  // Reset
  reset: () => void
}

interface AppSettingsStore extends AppSettingsState, AppSettingsActions {}

const initialState: AppSettingsState = {
  theme: "system",
  dateFormat: "DMY",
  timeFormat: "24h",
  lmsConnection: null,
  gitConnections: {},
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
        dateFormat: settings.date_format,
        timeFormat: settings.time_format,
        lmsConnection: settings.lms_connection ?? null,
        gitConnections: settings.git_connections ?? {},
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
        date_format: state.dateFormat,
        time_format: state.timeFormat,
        lms_connection: state.lmsConnection,
        git_connections: state.gitConnections,
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
  setDateFormat: (dateFormat) => set({ dateFormat }),
  setTimeFormat: (timeFormat) => set({ timeFormat }),

  setLmsConnection: (connection) => set({ lmsConnection: connection }),

  addGitConnection: (name, connection) =>
    set((state) => ({
      gitConnections: { ...state.gitConnections, [name]: connection },
    })),

  updateGitConnection: (name, connection) =>
    set((state) => ({
      gitConnections: { ...state.gitConnections, [name]: connection },
    })),

  renameGitConnection: (oldName, newName, connection) =>
    set((state) => {
      const { [oldName]: _, ...rest } = state.gitConnections
      // Trigger cleanup in connectionsStore to move status to new name
      useConnectionsStore.getState().renameGitStatus(oldName, newName)
      return { gitConnections: { ...rest, [newName]: connection } }
    }),

  removeGitConnection: (name) =>
    set((state) => {
      const { [name]: _, ...rest } = state.gitConnections
      // Trigger cleanup in connectionsStore to remove orphaned status
      useConnectionsStore.getState().removeGitStatus(name)
      return { gitConnections: rest }
    }),

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
export const selectAppSettingsStatus = (state: AppSettingsStore) => state.status
export const selectAppSettingsError = (state: AppSettingsStore) => state.error
