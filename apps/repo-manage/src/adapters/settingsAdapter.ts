/**
 * Settings adapter - transforms between backend (snake_case) and store (camelCase) formats
 *
 * The backend (Rust/Tauri) uses snake_case field names, while the frontend stores use camelCase.
 * This adapter provides pure functions for bidirectional transformation.
 */

import {
  DEFAULT_CANVAS_CONFIG,
  DEFAULT_GITEA_CONFIG,
  DEFAULT_GITHUB_CONFIG,
  DEFAULT_GITLAB_CONFIG,
  DEFAULT_GUI_THEME,
  DEFAULT_LMS_SETTINGS,
  DEFAULT_LOG_LEVELS,
  DEFAULT_MOODLE_CONFIG,
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
 * Map backend courses to store format (add status field)
 */
function mapCourses(
  courses: { id: string; name: string | null }[] | undefined,
) {
  return (courses || []).map((course) => ({
    id: course.id,
    name: course.name,
    // If course has a name, it was verified; otherwise pending
    status: course.name ? ("verified" as const) : ("pending" as const),
  }))
}

/**
 * Transform backend GuiSettings to store-friendly format
 */
export function toStoreFormat(settings: GuiSettings): StoreFormats {
  const lms = settings.lms
  const git = settings.git
  const repo = settings.repo
  const logging = settings.logging

  return {
    lms: {
      lmsType: (lms.type || DEFAULT_LMS_SETTINGS.lmsType) as
        | "Canvas"
        | "Moodle",
      canvas: {
        accessToken:
          lms.canvas?.access_token || DEFAULT_CANVAS_CONFIG.accessToken,
        baseUrl: lms.canvas?.base_url || DEFAULT_CANVAS_CONFIG.baseUrl,
        customUrl: lms.canvas?.custom_url || DEFAULT_CANVAS_CONFIG.customUrl,
        urlOption: (lms.canvas?.url_option ||
          DEFAULT_CANVAS_CONFIG.urlOption) as "TUE" | "CUSTOM",
        courses: mapCourses(lms.canvas?.courses),
      },
      moodle: {
        accessToken:
          lms.moodle?.access_token || DEFAULT_MOODLE_CONFIG.accessToken,
        baseUrl: lms.moodle?.base_url || DEFAULT_MOODLE_CONFIG.baseUrl,
        courses: mapCourses(lms.moodle?.courses),
      },
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
      gitServerType: (git.type || DEFAULT_REPO_SETTINGS.gitServerType) as
        | "GitHub"
        | "GitLab"
        | "Gitea",
      github: {
        accessToken:
          git.github?.access_token || DEFAULT_GITHUB_CONFIG.accessToken,
        user: git.github?.user || DEFAULT_GITHUB_CONFIG.user,
        studentReposOrg:
          git.github?.student_repos_org ||
          DEFAULT_GITHUB_CONFIG.studentReposOrg,
        templateOrg:
          git.github?.template_org || DEFAULT_GITHUB_CONFIG.templateOrg,
      },
      gitlab: {
        accessToken:
          git.gitlab?.access_token || DEFAULT_GITLAB_CONFIG.accessToken,
        baseUrl: git.gitlab?.base_url || DEFAULT_GITLAB_CONFIG.baseUrl,
        user: git.gitlab?.user || DEFAULT_GITLAB_CONFIG.user,
        studentReposGroup:
          git.gitlab?.student_repos_group ||
          DEFAULT_GITLAB_CONFIG.studentReposGroup,
        templateGroup:
          git.gitlab?.template_group || DEFAULT_GITLAB_CONFIG.templateGroup,
      },
      gitea: {
        accessToken:
          git.gitea?.access_token || DEFAULT_GITEA_CONFIG.accessToken,
        baseUrl: git.gitea?.base_url || DEFAULT_GITEA_CONFIG.baseUrl,
        user: git.gitea?.user || DEFAULT_GITEA_CONFIG.user,
        studentReposGroup:
          git.gitea?.student_repos_group ||
          DEFAULT_GITEA_CONFIG.studentReposGroup,
        templateGroup:
          git.gitea?.template_group || DEFAULT_GITEA_CONFIG.templateGroup,
      },
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
 * Strip status field from courses for backend format
 */
function stripCourseStatus(
  courses: { id: string; name: string | null; status: string }[],
) {
  return courses.map((course) => ({
    id: course.id,
    name: course.name,
  }))
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
    // Git settings (per-server configs)
    git: {
      type: repoState.gitServerType as "GitHub" | "GitLab" | "Gitea",
      github: {
        access_token: repoState.github.accessToken,
        user: repoState.github.user,
        student_repos_org: repoState.github.studentReposOrg,
        template_org: repoState.github.templateOrg,
      },
      gitlab: {
        access_token: repoState.gitlab.accessToken,
        base_url: repoState.gitlab.baseUrl,
        user: repoState.gitlab.user,
        student_repos_group: repoState.gitlab.studentReposGroup,
        template_group: repoState.gitlab.templateGroup,
      },
      gitea: {
        access_token: repoState.gitea.accessToken,
        base_url: repoState.gitea.baseUrl,
        user: repoState.gitea.user,
        student_repos_group: repoState.gitea.studentReposGroup,
        template_group: repoState.gitea.templateGroup,
      },
    },
    // LMS settings
    lms: {
      type: lmsState.lmsType as "Canvas" | "Moodle",
      canvas: {
        access_token: lmsState.canvas.accessToken,
        base_url: lmsState.canvas.baseUrl,
        custom_url: lmsState.canvas.customUrl,
        url_option: lmsState.canvas.urlOption as "TUE" | "CUSTOM",
        courses: stripCourseStatus(lmsState.canvas.courses),
      },
      moodle: {
        access_token: lmsState.moodle.accessToken,
        base_url: lmsState.moodle.baseUrl,
        courses: stripCourseStatus(lmsState.moodle.courses),
      },
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
