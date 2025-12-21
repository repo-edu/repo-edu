/**
 * Settings adapter - transforms between backend (snake_case) and store (camelCase) formats
 *
 * The backend (Rust/Tauri) uses snake_case field names, while the frontend stores use camelCase.
 * This adapter provides pure functions for bidirectional transformation.
 */

import {
  DEFAULT_GUI_THEME,
  DEFAULT_LMS_SETTINGS,
  DEFAULT_LOG_LEVELS,
  DEFAULT_REPO_SETTINGS,
} from "../constants"
import type { Strict } from "../services/commandUtils"
import type { LmsFormState } from "../stores/lmsFormStore"
import type { RepoFormState } from "../stores/repoFormStore"
import type { GuiSettings } from "../types/settings"

/**
 * Result of transforming backend settings to store format
 */
export interface StoreFormats {
  lms: LmsFormState
  repo: RepoFormState
  ui: {
    activeTab: "lms" | "repo"
    collapsedSections: string[]
    sidebarOpen: boolean
  }
}

/**
 * Transform backend GuiSettings to store-friendly format
 */
export function toStoreFormat(settings: GuiSettings): StoreFormats {
  const lms = settings.lms
  const common = settings.common
  const repo = settings.repo
  const logging = settings.logging

  // Map backend courses to store format (add status field)
  const courses = (lms.courses || []).map((course) => ({
    id: course.id,
    name: course.name,
    // If course has a name, it was verified; otherwise pending
    status: course.name ? ("verified" as const) : ("pending" as const),
  }))

  return {
    lms: {
      lmsType: (lms.type || DEFAULT_LMS_SETTINGS.lmsType) as
        | "Canvas"
        | "Moodle",
      baseUrl: lms.base_url || DEFAULT_LMS_SETTINGS.baseUrl,
      customUrl: lms.custom_url || DEFAULT_LMS_SETTINGS.customUrl,
      urlOption:
        lms.type !== "Canvas"
          ? "CUSTOM"
          : ((lms.url_option || DEFAULT_LMS_SETTINGS.urlOption) as
              | "TUE"
              | "CUSTOM"),
      accessToken: lms.access_token || DEFAULT_LMS_SETTINGS.accessToken,
      courses,
      activeCourseIndex: DEFAULT_LMS_SETTINGS.activeCourseIndex,
      yamlFile: lms.yaml_file || DEFAULT_LMS_SETTINGS.yamlFile,
      outputFolder: lms.output_folder || DEFAULT_LMS_SETTINGS.outputFolder,
      csvFile: lms.csv_file || DEFAULT_LMS_SETTINGS.csvFile,
      xlsxFile: lms.xlsx_file || DEFAULT_LMS_SETTINGS.xlsxFile,
      memberOption: (lms.member_option || DEFAULT_LMS_SETTINGS.memberOption) as
        | "(email, gitid)"
        | "email"
        | "git_id",
      includeGroup: lms.include_group ?? DEFAULT_LMS_SETTINGS.includeGroup,
      includeMember: lms.include_member ?? DEFAULT_LMS_SETTINGS.includeMember,
      includeInitials:
        lms.include_initials ?? DEFAULT_LMS_SETTINGS.includeInitials,
      fullGroups: lms.full_groups ?? DEFAULT_LMS_SETTINGS.fullGroups,
      csv: lms.output_csv ?? DEFAULT_LMS_SETTINGS.csv,
      xlsx: lms.output_xlsx ?? DEFAULT_LMS_SETTINGS.xlsx,
      yaml: lms.output_yaml ?? DEFAULT_LMS_SETTINGS.yaml,
    },
    repo: {
      accessToken: common.git_access_token || DEFAULT_REPO_SETTINGS.accessToken,
      user: common.git_user || DEFAULT_REPO_SETTINGS.user,
      baseUrl: common.git_base_url || DEFAULT_REPO_SETTINGS.baseUrl,
      studentReposGroup:
        repo.student_repos_group || DEFAULT_REPO_SETTINGS.studentReposGroup,
      templateGroup: repo.template_group || DEFAULT_REPO_SETTINGS.templateGroup,
      yamlFile: repo.yaml_file || DEFAULT_REPO_SETTINGS.yamlFile,
      targetFolder: repo.target_folder || DEFAULT_REPO_SETTINGS.targetFolder,
      assignments: repo.assignments || DEFAULT_REPO_SETTINGS.assignments,
      directoryLayout: (repo.directory_layout ||
        DEFAULT_REPO_SETTINGS.directoryLayout) as
        | "by-team"
        | "flat"
        | "by-task",
      logLevels: {
        info: logging?.info ?? DEFAULT_LOG_LEVELS.info,
        debug: logging?.debug ?? DEFAULT_LOG_LEVELS.debug,
        warning: logging?.warning ?? DEFAULT_LOG_LEVELS.warning,
        error: logging?.error ?? DEFAULT_LOG_LEVELS.error,
      },
    },
    ui: {
      activeTab: settings.active_tab === "repo" ? "repo" : "lms",
      collapsedSections: settings.collapsed_sections ?? [],
      sidebarOpen: settings.sidebar_open ?? false,
    },
  }
}

/**
 * Transform store state back to backend format
 */
export function toBackendFormat(
  lmsState: LmsFormState,
  repoState: RepoFormState,
  uiState: {
    activeTab: "lms" | "repo"
    collapsedSections: string[]
    sidebarOpen: boolean
    theme: string
    windowWidth: number
    windowHeight: number
  },
): Strict<GuiSettings> {
  return {
    // Common settings (shared git credentials)
    common: {
      git_base_url: repoState.baseUrl,
      git_access_token: repoState.accessToken,
      git_user: repoState.user,
    },
    // LMS settings
    lms: {
      type: lmsState.lmsType as "Canvas" | "Moodle",
      base_url: lmsState.baseUrl,
      custom_url: lmsState.customUrl,
      url_option: lmsState.urlOption as "TUE" | "CUSTOM",
      access_token: lmsState.accessToken,
      // Map store courses to backend format (strip status field)
      courses: lmsState.courses.map((course) => ({
        id: course.id,
        name: course.name,
      })),
      yaml_file: lmsState.yamlFile,
      output_folder: lmsState.outputFolder,
      csv_file: lmsState.csvFile,
      xlsx_file: lmsState.xlsxFile,
      member_option: lmsState.memberOption as
        | "(email, gitid)"
        | "email"
        | "git_id",
      include_group: lmsState.includeGroup,
      include_member: lmsState.includeMember,
      include_initials: lmsState.includeInitials,
      full_groups: lmsState.fullGroups,
      output_csv: lmsState.csv,
      output_xlsx: lmsState.xlsx,
      output_yaml: lmsState.yaml,
    },
    // Repo settings
    repo: {
      student_repos_group: repoState.studentReposGroup,
      template_group: repoState.templateGroup,
      yaml_file: repoState.yamlFile,
      target_folder: repoState.targetFolder,
      assignments: repoState.assignments,
      directory_layout: repoState.directoryLayout as
        | "flat"
        | "by-team"
        | "by-task",
    },
    // App settings
    active_tab: uiState.activeTab,
    collapsed_sections: uiState.collapsedSections,
    theme: (uiState.theme || DEFAULT_GUI_THEME) as "light" | "dark" | "system",
    sidebar_open: uiState.sidebarOpen,
    window_width: uiState.windowWidth,
    window_height: uiState.windowHeight,
    logging: {
      info: repoState.logLevels.info,
      debug: repoState.logLevels.debug,
      warning: repoState.logLevels.warning,
      error: repoState.logLevels.error,
    },
  }
}
