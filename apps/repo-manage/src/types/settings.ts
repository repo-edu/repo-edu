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

// ===== Settings Interfaces =====

/** Common settings shared between CLI and GUI */
export interface CommonSettings {
  // LMS settings
  lms_type: LmsType;
  lms_base_url: string;
  lms_custom_url: string;
  lms_url_option: LmsUrlOption;
  lms_access_token: string;
  lms_course_id: string;
  lms_course_name: string;
  lms_yaml_file: string;
  lms_info_folder: string;
  lms_csv_file: string;
  lms_xlsx_file: string;
  lms_member_option: LmsMemberOption;
  lms_include_group: boolean;
  lms_include_member: boolean;
  lms_include_initials: boolean;
  lms_full_groups: boolean;
  lms_output_csv: boolean;
  lms_output_xlsx: boolean;
  lms_output_yaml: boolean;

  // Git platform settings
  git_base_url: string;
  git_access_token: string;
  git_user: string;
  git_student_repos_group: string;
  git_template_group: string;

  // Repository setup settings
  yaml_file: string;
  target_folder: string;
  assignments: string;
  directory_layout: DirectoryLayout;

  // Logging settings
  log_info: boolean;
  log_debug: boolean;
  log_warning: boolean;
  log_error: boolean;
}

/** GUI-specific settings (includes common settings via flattening) */
export interface GuiSettings extends CommonSettings {
  // GUI-specific fields
  active_tab: ActiveTab;
  config_locked: boolean;
  options_locked: boolean;
  window_width: number;
  window_height: number;
  window_x: number;
  window_y: number;
}

// ===== Default Values =====

/** Default common settings */
export const DEFAULT_COMMON_SETTINGS: CommonSettings = {
  // LMS settings
  lms_type: "Canvas",
  lms_base_url: "https://canvas.tue.nl",
  lms_custom_url: "",
  lms_url_option: "TUE",
  lms_access_token: "",
  lms_course_id: "",
  lms_course_name: "",
  lms_yaml_file: "students.yaml",
  lms_info_folder: "",
  lms_csv_file: "student-info.csv",
  lms_xlsx_file: "student-info.xlsx",
  lms_member_option: "(email, gitid)",
  lms_include_group: true,
  lms_include_member: true,
  lms_include_initials: false,
  lms_full_groups: true,
  lms_output_csv: false,
  lms_output_xlsx: false,
  lms_output_yaml: true,

  // Git platform settings
  git_base_url: "https://gitlab.tue.nl",
  git_access_token: "",
  git_user: "",
  git_student_repos_group: "",
  git_template_group: "",

  // Repository setup settings
  yaml_file: "students.yaml",
  target_folder: "",
  assignments: "",
  directory_layout: "flat",

  // Logging settings
  log_info: true,
  log_debug: false,
  log_warning: true,
  log_error: true,
};

/** Default GUI settings */
export const DEFAULT_GUI_SETTINGS: GuiSettings = {
  ...DEFAULT_COMMON_SETTINGS,
  active_tab: "lms",
  config_locked: true,
  options_locked: true,
  window_width: 0,
  window_height: 0,
  window_x: 0,
  window_y: 0,
};

// ===== Helper Functions =====

/**
 * Validate that a value matches the GuiSettings interface
 * @param value The value to validate
 * @returns true if the value is a valid GuiSettings object
 */
export function isGuiSettings(value: any): value is GuiSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.lms_type === "string" &&
    typeof value.lms_base_url === "string" &&
    typeof value.git_base_url === "string" &&
    typeof value.active_tab === "string" &&
    typeof value.config_locked === "boolean"
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
    ...partial,
  };
}
