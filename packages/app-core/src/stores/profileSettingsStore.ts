/**
 * Profile-scoped settings store.
 * Holds course binding, git connection reference, operations, and export settings.
 * References git connections by name (stored in appSettingsStore).
 */

import type {
  CourseInfo,
  ExportSettings,
  OperationConfigs,
  ProfileSettings,
} from "@repo-edu/backend-interface/types"
import { create } from "zustand"
import { commands } from "../bindings/commands"
import { errorResult, type LoadResult, okResult } from "../types/load"

type StoreStatus = "loading" | "loaded" | "saving" | "error"

interface ProfileSettingsState {
  course: CourseInfo
  gitConnection: string | null
  operations: OperationConfigs
  exports: ExportSettings
  status: StoreStatus
  error: string | null
  warnings: string[]
}

interface ProfileSettingsActions {
  // Loading and saving
  load: (profileName: string) => Promise<LoadResult>
  save: (profileName: string) => Promise<void>

  // Course (for name updates after verification)
  setCourse: (course: CourseInfo) => void

  // Git connection reference
  setGitConnection: (name: string | null) => void

  // Operations config
  updateOperations: (operations: Partial<OperationConfigs>) => void
  setOperations: (operations: OperationConfigs) => void

  // Export settings
  updateExports: (exports: Partial<ExportSettings>) => void
  setExports: (exports: ExportSettings) => void

  // Set from loaded settings
  setFromSettings: (settings: ProfileSettings, warnings?: string[]) => void

  // Reset
  reset: () => void
}

interface ProfileSettingsStore
  extends ProfileSettingsState,
    ProfileSettingsActions {}

const defaultOperations: OperationConfigs = {
  target_org: "",
  repo_name_template: "{assignment}-{group}",
  create: {
    template_org: "",
  },
  clone: {
    target_dir: "",
    directory_layout: "flat",
  },
  delete: {},
}

const defaultExports: ExportSettings = {
  output_folder: "",
  output_csv: false,
  output_xlsx: false,
  output_yaml: true,
  csv_file: "student-info.csv",
  xlsx_file: "student-info.xlsx",
  yaml_file: "students.yaml",
  member_option: "(email, gitid)",
  include_group: true,
  include_member: true,
  include_initials: false,
  full_groups: true,
}

const initialState: ProfileSettingsState = {
  course: { id: "", name: "" },
  gitConnection: null,
  operations: { ...defaultOperations },
  exports: { ...defaultExports },
  status: "loading",
  error: null,
  warnings: [],
}

export const useProfileSettingsStore = create<ProfileSettingsStore>(
  (set, get) => ({
    ...initialState,

    load: async (profileName) => {
      set({ status: "loading", error: null, warnings: [] })
      try {
        const result = await commands.loadProfile(profileName)
        if (result.status === "error") {
          set({ status: "error", error: result.error.message })
          return errorResult(result.error.message)
        }
        const { settings, warnings } = result.data
        set({
          course: settings.course,
          gitConnection: settings.git_connection ?? null,
          operations: settings.operations,
          exports: settings.exports,
          status: "loaded",
          error: null,
          warnings,
        })
        return okResult(warnings)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        set({ status: "error", error: message })
        return errorResult(message)
      }
    },

    save: async (profileName) => {
      const state = get()
      set({ status: "saving", error: null })
      try {
        const settings: ProfileSettings = {
          course: state.course,
          git_connection: state.gitConnection,
          operations: state.operations,
          exports: state.exports,
        }
        const result = await commands.saveProfile(profileName, settings)
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

    setCourse: (course) => set({ course }),

    setGitConnection: (name) => set({ gitConnection: name }),

    updateOperations: (operations) =>
      set((state) => ({
        operations: { ...state.operations, ...operations },
      })),

    setOperations: (operations) => set({ operations }),

    updateExports: (exports) =>
      set((state) => ({
        exports: { ...state.exports, ...exports },
      })),

    setExports: (exports) => set({ exports }),

    setFromSettings: (settings, warnings = []) =>
      set({
        course: settings.course,
        gitConnection: settings.git_connection ?? null,
        operations: settings.operations,
        exports: settings.exports,
        status: "loaded",
        error: null,
        warnings,
      }),

    reset: () => set(initialState),
  }),
)

// Selector helpers
export const selectCourse = (state: ProfileSettingsStore) => state.course
export const selectGitConnectionRef = (state: ProfileSettingsStore) =>
  state.gitConnection
export const selectOperations = (state: ProfileSettingsStore) =>
  state.operations
export const selectExports = (state: ProfileSettingsStore) => state.exports
export const selectProfileSettingsStatus = (state: ProfileSettingsStore) =>
  state.status
export const selectProfileSettingsError = (state: ProfileSettingsStore) =>
  state.error
export const selectProfileSettingsWarnings = (state: ProfileSettingsStore) =>
  state.warnings
