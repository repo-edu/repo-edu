import type {
  DateFormatPreference,
  PersistedAppSettings,
  PersistedGitConnection,
  PersistedLmsConnection,
  ThemePreference,
  TimeFormatPreference,
} from "@repo-edu/domain"
import { defaultAppSettings } from "@repo-edu/domain"
import { create } from "zustand"
import { getWorkflowClient } from "../contexts/workflow-client.js"
import type { StoreStatus } from "../types/index.js"
import { getErrorMessage } from "../utils/error-message.js"
import { useConnectionsStore } from "./connections-store.js"

type AppSettingsState = {
  settings: PersistedAppSettings
  status: StoreStatus
  error: string | null
}

type AppSettingsActions = {
  load: () => Promise<void>
  save: () => Promise<void>

  setActiveProfileId: (profileId: string | null) => void

  setTheme: (theme: ThemePreference) => void
  setDateFormat: (dateFormat: DateFormatPreference) => void
  setTimeFormat: (timeFormat: TimeFormatPreference) => void

  setLmsConnection: (index: number, connection: PersistedLmsConnection) => void
  addLmsConnection: (connection: PersistedLmsConnection) => void
  removeLmsConnection: (index: number) => void

  addGitConnection: (connection: PersistedGitConnection) => void
  updateGitConnection: (
    name: string,
    connection: PersistedGitConnection,
  ) => void
  renameGitConnection: (
    oldName: string,
    newName: string,
    connection: PersistedGitConnection,
  ) => void
  removeGitConnection: (name: string) => void

  setRosterColumnVisibility: (visibility: Record<string, boolean>) => void
  setRosterColumnSizing: (sizing: Record<string, number>) => void

  reset: () => void
}

const initialState: AppSettingsState = {
  settings: defaultAppSettings,
  status: "loading",
  error: null,
}

export const useAppSettingsStore = create<
  AppSettingsState & AppSettingsActions
>((set, get) => ({
  ...initialState,

  load: async () => {
    try {
      set({ status: "loading", error: null })
      const client = getWorkflowClient()
      const loaded = await client.run("settings.loadApp", undefined)
      set({ settings: loaded, status: "loaded" })
    } catch (err) {
      set({
        status: "error",
        error: getErrorMessage(err),
      })
    }
  },

  save: async () => {
    try {
      set({ status: "saving", error: null })
      const client = getWorkflowClient()
      const saved = await client.run("settings.saveApp", get().settings)
      set({ settings: saved, status: "loaded" })
    } catch (err) {
      set({
        status: "error",
        error: getErrorMessage(err),
      })
    }
  },

  setActiveProfileId: (profileId) =>
    set((state) => ({
      settings: {
        ...state.settings,
        activeProfileId: profileId,
      },
    })),

  setTheme: (theme) =>
    set((state) => ({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, theme },
      },
    })),

  setDateFormat: (dateFormat) =>
    set((state) => ({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, dateFormat },
      },
    })),

  setTimeFormat: (timeFormat) =>
    set((state) => ({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, timeFormat },
      },
    })),

  setLmsConnection: (index, connection) =>
    set((state) => {
      const connections = [...state.settings.lmsConnections]
      const previousName = connections[index]?.name ?? null
      connections[index] = connection
      if (previousName !== null && previousName !== connection.name) {
        useConnectionsStore
          .getState()
          .renameLmsConnectionStatus(previousName, connection.name)
      }
      return {
        settings: { ...state.settings, lmsConnections: connections },
      }
    }),

  addLmsConnection: (connection) =>
    set((state) => ({
      settings: {
        ...state.settings,
        lmsConnections: [...state.settings.lmsConnections, connection],
      },
    })),

  removeLmsConnection: (index) =>
    set((state) => {
      const removedName = state.settings.lmsConnections[index]?.name ?? null
      if (removedName !== null) {
        useConnectionsStore.getState().removeLmsConnectionStatus(removedName)
      }
      return {
        settings: {
          ...state.settings,
          lmsConnections: state.settings.lmsConnections.filter(
            (_, i) => i !== index,
          ),
        },
      }
    }),

  addGitConnection: (connection) =>
    set((state) => ({
      settings: {
        ...state.settings,
        gitConnections: [...state.settings.gitConnections, connection],
      },
    })),

  updateGitConnection: (name, connection) =>
    set((state) => ({
      settings: {
        ...state.settings,
        gitConnections: state.settings.gitConnections.map((gc) =>
          gc.name === name ? connection : gc,
        ),
      },
    })),

  renameGitConnection: (oldName, newName, connection) => {
    set((state) => ({
      settings: {
        ...state.settings,
        gitConnections: state.settings.gitConnections.map((gc) =>
          gc.name === oldName ? { ...connection, name: newName } : gc,
        ),
      },
    }))
    useConnectionsStore.getState().renameGitStatus(oldName, newName)
  },

  removeGitConnection: (name) => {
    set((state) => ({
      settings: {
        ...state.settings,
        gitConnections: state.settings.gitConnections.filter(
          (gc) => gc.name !== name,
        ),
      },
    }))
    useConnectionsStore.getState().removeGitStatus(name)
  },

  setRosterColumnVisibility: (visibility) =>
    set((state) => ({
      settings: { ...state.settings, rosterColumnVisibility: visibility },
    })),

  setRosterColumnSizing: (sizing) =>
    set((state) => ({
      settings: { ...state.settings, rosterColumnSizing: sizing },
    })),

  reset: () => set(initialState),
}))

export const selectTheme = (state: AppSettingsState) =>
  state.settings.appearance.theme
export const selectAppSettingsActiveProfileId = (state: AppSettingsState) =>
  state.settings.activeProfileId
export const selectLmsConnections = (state: AppSettingsState) =>
  state.settings.lmsConnections
export const selectGitConnections = (state: AppSettingsState) =>
  state.settings.gitConnections
export const selectGitConnection =
  (name: string) => (state: AppSettingsState) =>
    state.settings.gitConnections.find((gc) => gc.name === name) ?? null
export const selectRosterColumnVisibility = (state: AppSettingsState) =>
  state.settings.rosterColumnVisibility
export const selectRosterColumnSizing = (state: AppSettingsState) =>
  state.settings.rosterColumnSizing
export const selectAppSettingsStatus = (state: AppSettingsState) => state.status
export const selectAppSettingsError = (state: AppSettingsState) => state.error
