import {
  defaultAppSettings,
  type PersistedAnalysisSidebarSettings,
  type PersistedAppSettings,
  type PersistedGitConnection,
  type PersistedLmsConnection,
} from "@repo-edu/domain/settings"
import type {
  ActiveTab,
  DateFormatPreference,
  ThemePreference,
  TimeFormatPreference,
} from "@repo-edu/domain/types"
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

  setActiveCourseId: (courseId: string | null) => void
  setActiveTab: (tab: ActiveTab) => void

  setTheme: (theme: ThemePreference) => void
  setDateFormat: (dateFormat: DateFormatPreference) => void
  setTimeFormat: (timeFormat: TimeFormatPreference) => void

  setLmsConnection: (index: number, connection: PersistedLmsConnection) => void
  addLmsConnection: (connection: PersistedLmsConnection) => void
  removeLmsConnection: (index: number) => void

  addGitConnection: (connection: PersistedGitConnection) => void
  updateGitConnection: (id: string, connection: PersistedGitConnection) => void
  removeGitConnection: (id: string) => void

  setRosterColumnVisibility: (visibility: Record<string, boolean>) => void
  setRosterColumnSizing: (sizing: Record<string, number>) => void
  setGroupsSidebarSize: (size: number) => void
  setAnalysisSidebarSize: (size: number) => void
  setAnalysisSidebar: (sidebar: PersistedAnalysisSidebarSettings | null) => void

  reset: () => void
}

const initialState: AppSettingsState = {
  settings: defaultAppSettings,
  status: "loading",
  error: null,
}

export const useAppSettingsStore = create<
  AppSettingsState & AppSettingsActions
>((set, get) => {
  let loadRequestId = 0
  let saveRequestId = 0

  return {
    ...initialState,

    load: async () => {
      const requestId = ++loadRequestId
      try {
        set({ status: "loading", error: null })
        const client = getWorkflowClient()
        const loaded = await client.run("settings.loadApp", undefined)
        set((state) => {
          if (requestId !== loadRequestId || state.status !== "loading") {
            return state
          }
          return { settings: loaded, status: "loaded", error: null }
        })
      } catch (err) {
        set((state) => {
          if (requestId !== loadRequestId) {
            return state
          }
          return {
            status: "error",
            error: getErrorMessage(err),
          }
        })
      }
    },

    save: async () => {
      const requestId = ++saveRequestId
      const settingsAtRequest = get().settings
      try {
        set({ status: "saving", error: null })
        const client = getWorkflowClient()
        const saved = await client.run("settings.saveApp", settingsAtRequest)
        set((state) => {
          if (requestId !== saveRequestId) {
            return state
          }
          return {
            settings:
              state.settings === settingsAtRequest ? saved : state.settings,
            status: "loaded",
            error: null,
          }
        })
      } catch (err) {
        set((state) => {
          if (requestId !== saveRequestId) {
            return state
          }
          return {
            status: "error",
            error: getErrorMessage(err),
          }
        })
      }
    },

    setActiveCourseId: (courseId) =>
      set((state) => ({
        settings: {
          ...state.settings,
          activeCourseId: courseId,
        },
      })),

    setActiveTab: (tab) =>
      set((state) => ({
        settings: {
          ...state.settings,
          activeTab: tab,
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

    updateGitConnection: (id, connection) =>
      set((state) => ({
        settings: {
          ...state.settings,
          gitConnections: state.settings.gitConnections.map((gc) =>
            gc.id === id ? connection : gc,
          ),
        },
      })),

    removeGitConnection: (id) => {
      set((state) => ({
        settings: {
          ...state.settings,
          gitConnections: state.settings.gitConnections.filter(
            (gc) => gc.id !== id,
          ),
        },
      }))
      useConnectionsStore.getState().removeGitStatus(id)
    },

    setRosterColumnVisibility: (visibility) =>
      set((state) => ({
        settings: { ...state.settings, rosterColumnVisibility: visibility },
      })),

    setRosterColumnSizing: (sizing) =>
      set((state) => ({
        settings: { ...state.settings, rosterColumnSizing: sizing },
      })),

    setGroupsSidebarSize: (size) =>
      set((state) => ({
        settings: { ...state.settings, groupsSidebarSize: size },
      })),

    setAnalysisSidebarSize: (size) =>
      set((state) => ({
        settings: { ...state.settings, analysisSidebarSize: size },
      })),

    setAnalysisSidebar: (sidebar) =>
      set((state) => ({
        settings: { ...state.settings, analysisSidebar: sidebar },
      })),

    reset: () => set(initialState),
  }
})

export const selectTheme = (state: AppSettingsState) =>
  state.settings.appearance.theme
export const selectAppSettingsActiveCourseId = (state: AppSettingsState) =>
  state.settings.activeCourseId
export const selectAppSettingsActiveTab = (state: AppSettingsState) =>
  state.settings.activeTab
export const selectLmsConnections = (state: AppSettingsState) =>
  state.settings.lmsConnections
export const selectGitConnections = (state: AppSettingsState) =>
  state.settings.gitConnections
export const selectGitConnection = (id: string) => (state: AppSettingsState) =>
  state.settings.gitConnections.find((gc) => gc.id === id) ?? null
export const selectRosterColumnVisibility = (state: AppSettingsState) =>
  state.settings.rosterColumnVisibility
export const selectRosterColumnSizing = (state: AppSettingsState) =>
  state.settings.rosterColumnSizing
export const selectAppSettingsStatus = (state: AppSettingsState) => state.status
export const selectAppSettingsError = (state: AppSettingsState) => state.error
