/**
 * TypeScript types for RepoBee settings
 * These types match the Rust GuiSettings structure from repobee-core
 */

// ===== Enums =====

/** LMS URL selection option */
export type LmsUrlOption = "TUE" | "CUSTOM";

/** LMS member identifier format */
export type LmsMemberOption = "(email, gitid)" | "email" | "git_id";

/** Directory layout for cloned repositories */
export type DirectoryLayout = "flat" | "by-team" | "by-task";

/** Active tab in the GUI */
export type ActiveTab = "lms" | "repo";

/** LMS platform type */
export type LmsType = "Canvas" | "Moodle";

/** UI theme */
export type Theme = "light" | "dark" | "system";

// ===== Nested Settings Interfaces =====

/** Common settings shared between apps (git credentials) */
export interface CommonSettings {
  git_base_url: string;
  git_access_token: string;
  git_user: string;
}

/** LMS app settings (Tab 1) */
export interface LmsSettings {
  type: LmsType;
  base_url: string;
  custom_url: string;
  url_option: LmsUrlOption;
  access_token: string;
  course_id: string;
  course_name: string;
  yaml_file: string;
  info_folder: string;
  csv_file: string;
  xlsx_file: string;
  member_option: LmsMemberOption;
  include_group: boolean;
  include_member: boolean;
  include_initials: boolean;
  full_groups: boolean;
  output_csv: boolean;
  output_xlsx: boolean;
  output_yaml: boolean;
}

/** Repo app settings (Tab 2) */
export interface RepoSettings {
  student_repos_group: string;
  template_group: string;
  yaml_file: string;
  target_folder: string;
  assignments: string;
  directory_layout: DirectoryLayout;
}

/** Logging settings (stored in AppSettings) */
export interface LogSettings {
  info: boolean;
  debug: boolean;
  warning: boolean;
  error: boolean;
}

/** Profile settings (nested structure for per-profile data) */
export interface ProfileSettings {
  common: CommonSettings;
  lms: LmsSettings;
  repo: RepoSettings;
}

/** App-level settings stored in app.json */
export interface AppSettings {
  theme: Theme;
  active_tab: ActiveTab;
  config_locked: boolean;
  options_locked: boolean;
  sidebar_open: boolean;
  splitter_height: number;
  window_width: number;
  window_height: number;
  logging: LogSettings;
}

/** GUI settings (combined app + profile, flattened in JSON) */
export interface GuiSettings extends AppSettings, ProfileSettings {}

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
 * @param value The value to validate
 * @returns true if the value is a valid GuiSettings object
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
 * @param partial Partial settings to merge
 * @returns Complete settings with defaults for missing fields
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
