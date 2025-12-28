// DO NOT EDIT - Generated from schemas/types/*.schema.json
// Run `pnpm gen:bindings` to regenerate.


/**
 * Active tab in the GUI
 */
export type ActiveTab = 'lms' | 'repo';

/**
 * Unified error type for all Tauri commands
 */
export interface AppError {
  /**
   * User-friendly error message
   */
  message: string;
  /**
   * Optional technical details for debugging
   */
  details?: string | null;
}

/**
 * App-level settings stored in app.json
 * These are UI/window settings that don't belong in profiles
 */
export interface AppSettings {
  active_tab: ActiveTab;
  /**
   * IDs of collapsed sections (e.g., ["lms-config", "options"])
   */
  collapsed_sections?: string[];
  logging: LogSettings;
  sidebar_open: boolean;
  theme: Theme;
  window_height: number;
  window_width: number;
}

/**
 * Canvas-specific LMS configuration
 */
export interface CanvasConfig {
  access_token: string;
  base_url: string;
  courses: CourseEntry[];
  custom_url: string;
  url_option: LmsUrlOption;
}

export interface CloneParams {
  config: ConfigParams;
  yaml_file: string;
  assignments: string;
  target_folder: string;
  directory_layout: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
  details: string | null;
}

export interface ConfigParams {
  access_token: string;
  user: string;
  base_url: string;
  student_repos: string;
  template: string;
}

/**
 * A course entry with ID and optional name (populated after verification)
 */
export interface CourseEntry {
  id: string;
  name: string | null;
}

/**
 * Directory layout for cloned repositories
 */
export type DirectoryLayout = 'by-team' | 'flat' | 'by-task';

export interface GenerateFilesParams {
  base_url: string;
  access_token: string;
  course_id: string;
  lms_type: string;
  yaml_file: string;
  output_folder: string;
  csv_file: string;
  xlsx_file: string;
  member_option: string;
  include_group: boolean;
  include_member: boolean;
  include_initials: boolean;
  full_groups: boolean;
  csv: boolean;
  xlsx: boolean;
  yaml: boolean;
}

export interface GetGroupCategoriesParams {
  base_url: string;
  access_token: string;
  course_id: string;
  lms_type: string;
}

/**
 * GitHub-specific configuration (no base_url - always github.com)
 */
export interface GitHubConfig {
  access_token: string;
  user: string;
  student_repos_org: string;
  template_org: string;
}

/**
 * GitLab-specific configuration (requires base_url)
 */
export interface GitLabConfig {
  access_token: string;
  base_url: string;
  user: string;
  student_repos_group: string;
  template_group: string;
}

/**
 * Git server types for repository management
 */
export type GitServerType = 'GitHub' | 'GitLab' | 'Gitea';

/**
 * Git server settings (shared across apps)
 */
export interface GitSettings {
  gitea: GiteaConfig;
  github: GitHubConfig;
  gitlab: GitLabConfig;
  type: GitServerType;
}

/**
 * Gitea-specific configuration (requires base_url)
 */
export interface GiteaConfig {
  access_token: string;
  base_url: string;
  user: string;
  student_repos_group: string;
  template_group: string;
}

/**
 * Group category (group set) for frontend binding
 */
export interface GroupCategory {
  id: string;
  name: string;
  role: string | null;
  self_signup: string | null;
  course_id: string | null;
  group_limit: number | null;
}

/**
 * Combined GUI settings (sent to frontend)
 * This combines app settings with the active profile's settings
 */
export interface GuiSettings {
  active_tab: ActiveTab;
  /**
   * IDs of collapsed sections (e.g., ["lms-config", "options"])
   */
  collapsed_sections?: string[];
  logging: LogSettings;
  sidebar_open: boolean;
  theme: Theme;
  window_height: number;
  window_width: number;
  git: GitSettings;
  lms: LmsSettings;
  repo: RepoSettings;
}

/**
 * LMS app settings (Tab 1)
 */
export interface LmsSettings {
  canvas: CanvasConfig;
  moodle: MoodleConfig;
  type: string;
  /**
   * Index of the active course in the courses array
   */
  active_course_index?: number;
  csv_file: string;
  full_groups: boolean;
  include_group: boolean;
  include_initials: boolean;
  include_member: boolean;
  member_option: MemberOption;
  output_csv: boolean;
  output_folder: string;
  output_xlsx: boolean;
  output_yaml: boolean;
  xlsx_file: string;
  yaml_file: string;
}

/**
 * LMS URL preset options
 */
export type LmsUrlOption = 'TUE' | 'CUSTOM';

/**
 * Logging settings (stored in AppSettings)
 */
export interface LogSettings {
  debug: boolean;
  error: boolean;
  info: boolean;
  warning: boolean;
}

/**
 * Member option for YAML generation
 */
export type MemberOption = '(email, gitid)' | 'email' | 'git_id';

/**
 * Moodle-specific LMS configuration
 */
export interface MoodleConfig {
  access_token: string;
  base_url: string;
  courses: CourseEntry[];
}

/**
 * Profile settings (nested structure for per-profile data)
 */
export interface ProfileSettings {
  git: GitSettings;
  lms: LmsSettings;
  repo: RepoSettings;
}

/**
 * Repo app settings (Tab 2)
 */
export interface RepoSettings {
  assignments: string;
  directory_layout: DirectoryLayout;
  target_folder: string;
  yaml_file: string;
}

/**
 * Result of loading settings, including any warnings about corrected issues
 */
export interface SettingsLoadResult {
  settings: GuiSettings;
  /**
   * Warnings about issues found in the settings file
   * (unknown fields removed, invalid values replaced with defaults)
   */
  warnings: string[];
}

export interface SetupParams {
  config: ConfigParams;
  yaml_file: string;
  assignments: string;
}

/**
 * UI theme
 */
export type Theme = 'light' | 'dark' | 'system';

export interface VerifyCourseParams {
  base_url: string;
  access_token: string;
  course_id: string;
  lms_type: string;
}

export interface VerifyCourseResult {
  course_id: string;
  course_name: string;
}

export type Result<T, E> =
  | { status: "ok"; data: T }
  | { status: "error"; error: E };
