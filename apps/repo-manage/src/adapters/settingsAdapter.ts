/**
 * Settings adapter - transforms between backend and store formats.
 *
 * Provides separate adapters for:
 * - AppSettings (theme, connections, logging)
 * - ProfileSettings (course, git_connection ref, operations, exports)
 * - Roster (pass-through, minimal transformation)
 */

import type {
  AppSettings,
  ExportSettings,
  GitConnection,
  LmsConnection,
  LogSettings,
  OperationConfigs,
  ProfileSettings,
  Roster,
  Theme,
} from "../bindings/types"

// ============================================================================
// AppSettings Adapter Types
// ============================================================================

/**
 * Store-side representation of app settings.
 * Matches the AppSettingsState interface in appSettingsStore.
 */
export interface AppSettingsStoreState {
  theme: Theme
  lmsConnection: LmsConnection | null
  gitConnections: Record<string, GitConnection>
  logging: LogSettings
}

// ============================================================================
// ProfileSettings Adapter Types
// ============================================================================

/**
 * Store-side representation of profile settings.
 * Matches the ProfileSettingsState interface in profileSettingsStore.
 */
export interface ProfileSettingsStoreState {
  course: { id: string; name: string }
  gitConnection: string | null
  operations: OperationConfigs
  exports: ExportSettings
}

// ============================================================================
// AppSettings Adapters
// ============================================================================

/**
 * Transform backend AppSettings to store format.
 * Minimal transformation since field names are consistent.
 */
export function appSettingsToStore(
  settings: AppSettings,
): AppSettingsStoreState {
  return {
    theme: settings.theme,
    lmsConnection: settings.lms_connection ?? null,
    gitConnections: settings.git_connections ?? {},
    logging: settings.logging,
  }
}

/**
 * Transform store state back to backend AppSettings format.
 */
export function storeToAppSettings(state: AppSettingsStoreState): AppSettings {
  return {
    theme: state.theme,
    lms_connection: state.lmsConnection,
    git_connections: state.gitConnections,
    logging: state.logging,
  }
}

// ============================================================================
// ProfileSettings Adapters
// ============================================================================

/**
 * Transform backend ProfileSettings to store format.
 * Minimal transformation since field names are consistent.
 */
export function profileSettingsToStore(
  settings: ProfileSettings,
): ProfileSettingsStoreState {
  return {
    course: settings.course,
    gitConnection: settings.git_connection ?? null,
    operations: settings.operations,
    exports: settings.exports,
  }
}

/**
 * Transform store state back to backend ProfileSettings format.
 */
export function storeToProfileSettings(
  state: ProfileSettingsStoreState,
): ProfileSettings {
  return {
    course: state.course,
    git_connection: state.gitConnection,
    operations: state.operations,
    exports: state.exports,
  }
}

// ============================================================================
// Roster Adapters
// ============================================================================

/**
 * Transform roster for store.
 * Minimal transformation - mostly pass-through.
 */
export function rosterToStore(roster: Roster | null): Roster | null {
  return roster
}

/**
 * Transform store roster back to backend format.
 * Minimal transformation - mostly pass-through.
 */
export function storeToRoster(roster: Roster | null): Roster | null {
  return roster
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default app settings state
 */
export const defaultAppSettingsState: AppSettingsStoreState = {
  theme: "system",
  lmsConnection: null,
  gitConnections: {},
  logging: {
    info: true,
    debug: false,
    warning: true,
    error: true,
  },
}

/**
 * Default profile settings state
 */
export const defaultProfileSettingsState: ProfileSettingsStoreState = {
  course: { id: "", name: "" },
  gitConnection: null,
  operations: {
    target_org: "",
    repo_name_template: "{assignment}-{group}",
    create: { template_org: "" },
    clone: { target_dir: "", directory_layout: "flat" },
    delete: {},
  },
  exports: {
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
  },
}
