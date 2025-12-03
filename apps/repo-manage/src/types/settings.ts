/**
 * TypeScript types for RepoBee settings
 * Types are imported from auto-generated bindings.ts (Rust → TypeScript)
 * This file provides default values and helper functions
 */

// Re-export types from bindings (auto-generated from Rust)
export type {
  ActiveTab,
  AppSettings,
  CommonSettings,
  DirectoryLayout,
  GuiSettings,
  LmsSettings,
  LmsUrlOption,
  LogSettings,
  MemberOption,
  RepoSettings,
  Theme,
} from "../bindings";

// Import types for use in this file
import type {
  AppSettings,
  CommonSettings,
  GuiSettings,
  LmsSettings,
  LogSettings,
  RepoSettings,
} from "../bindings";

// Additional type aliases for compatibility
export type LmsMemberOption = "(email, gitid)" | "email" | "git_id";
export type LmsType = "Canvas" | "Moodle";

// Profile settings type (not exported from bindings, internal structure)
export interface ProfileSettings {
  common: CommonSettings;
  lms: LmsSettings;
  repo: RepoSettings;
}

// ===== Default Values =====

/** Default common settings */
export const DEFAULT_COMMON_SETTINGS: CommonSettings = {
  git_base_url: "https://gitlab.tue.nl",
  git_access_token: "",
  git_user: "",
};

/** Default LMS settings */
export const DEFAULT_LMS_SETTINGS: LmsSettings = {
  type: "Canvas",
  base_url: "https://canvas.tue.nl",
  custom_url: "",
  url_option: "TUE",
  access_token: "",
  course_id: "",
  course_name: "",
  yaml_file: "students.yaml",
  info_folder: "",
  csv_file: "student-info.csv",
  xlsx_file: "student-info.xlsx",
  member_option: "(email, gitid)",
  include_group: true,
  include_member: true,
  include_initials: false,
  full_groups: true,
  output_csv: false,
  output_xlsx: false,
  output_yaml: true,
};

/** Default repo settings */
export const DEFAULT_REPO_SETTINGS: RepoSettings = {
  student_repos_group: "",
  template_group: "",
  yaml_file: "students.yaml",
  target_folder: "",
  assignments: "",
  directory_layout: "flat",
};

/** Default logging settings */
export const DEFAULT_LOG_SETTINGS: LogSettings = {
  info: true,
  debug: false,
  warning: true,
  error: true,
};

/** Default profile settings */
export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  common: DEFAULT_COMMON_SETTINGS,
  lms: DEFAULT_LMS_SETTINGS,
  repo: DEFAULT_REPO_SETTINGS,
};

/** Default app settings */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  active_tab: "lms",
  config_locked: true,
  options_locked: true,
  sidebar_open: false,
  splitter_height: 400,
  window_width: 0,
  window_height: 0,
  logging: DEFAULT_LOG_SETTINGS,
};

/** Default GUI settings */
export const DEFAULT_GUI_SETTINGS: GuiSettings = {
  ...DEFAULT_APP_SETTINGS,
  ...DEFAULT_PROFILE_SETTINGS,
};

// ===== Helper Functions =====

/**
 * Validate that a value matches the GuiSettings interface
 */
export function isGuiSettings(value: unknown): value is GuiSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "common" in value &&
    "lms" in value &&
    "repo" in value &&
    typeof (value as GuiSettings).active_tab === "string" &&
    typeof (value as GuiSettings).config_locked === "boolean"
  );
}

/**
 * Merge partial settings with defaults
 */
export function mergeWithDefaults(partial: Partial<GuiSettings>): GuiSettings {
  return {
    ...DEFAULT_GUI_SETTINGS,
    common: { ...DEFAULT_COMMON_SETTINGS, ...partial.common },
    lms: { ...DEFAULT_LMS_SETTINGS, ...partial.lms },
    repo: { ...DEFAULT_REPO_SETTINGS, ...partial.repo },
    logging: { ...DEFAULT_LOG_SETTINGS, ...partial.logging },
  };
}
