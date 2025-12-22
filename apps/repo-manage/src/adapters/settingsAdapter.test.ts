import { describe, expect, it } from "vitest"
import {
  DEFAULT_GUI_THEME,
  DEFAULT_LMS_SETTINGS,
  DEFAULT_LOG_LEVELS,
} from "../constants"
import type { GuiSettings } from "../types/settings"
import { toBackendFormat, toStoreFormat } from "./settingsAdapter"

const sampleBackendSettings: GuiSettings = {
  git: {
    type: "GitLab",
    github: {
      access_token: "",
      user: "",
      student_repos_org: "",
      template_org: "",
    },
    gitlab: {
      access_token: "token123",
      base_url: "https://gitlab.example.com",
      user: "user1",
      student_repos_group: "group/students",
      template_group: "group/templates",
    },
    gitea: {
      access_token: "",
      base_url: "",
      user: "",
      student_repos_group: "",
      template_group: "",
    },
  },
  lms: {
    type: "Canvas",
    canvas: {
      access_token: "lms-token",
      base_url: "https://canvas.example.com",
      custom_url: "",
      url_option: "TUE",
      courses: [{ id: "42", name: "Algorithms" }],
    },
    moodle: {
      access_token: "",
      base_url: "",
      courses: [],
    },
    yaml_file: "students.yaml",
    output_folder: "/tmp/output",
    csv_file: "students.csv",
    xlsx_file: "students.xlsx",
    member_option: "(email, gitid)",
    include_group: true,
    include_member: true,
    include_initials: false,
    full_groups: true,
    output_csv: true,
    output_xlsx: false,
    output_yaml: true,
  },
  repo: {
    yaml_file: "students.yaml",
    target_folder: "/tmp/repos",
    assignments: "hw1,hw2",
    directory_layout: "flat",
  },
  active_tab: "lms",
  collapsed_sections: ["lms-config"],
  theme: DEFAULT_GUI_THEME,
  sidebar_open: true,
  window_width: 1200,
  window_height: 900,
  logging: { ...DEFAULT_LOG_LEVELS, debug: true },
}

describe("settingsAdapter", () => {
  it("round-trips backend -> store -> backend without losing data", () => {
    const store = toStoreFormat(sampleBackendSettings)

    const roundTrip = toBackendFormat(store.lms, store.repo, {
      activeTab: store.ui.activeTab,
      collapsedSections: store.ui.collapsedSections,
      sidebarOpen: store.ui.sidebarOpen,
      theme: sampleBackendSettings.theme,
      windowWidth: sampleBackendSettings.window_width,
      windowHeight: sampleBackendSettings.window_height,
    })

    expect(roundTrip).toEqual(sampleBackendSettings)
  })

  it("fills defaults when backend omits optional fields", () => {
    const partial: GuiSettings = {
      ...sampleBackendSettings,
      lms: {
        ...sampleBackendSettings.lms,
        canvas: {
          access_token: "lms-token",
          base_url: "",
          custom_url: "",
          url_option: undefined as unknown as "TUE",
          courses: [{ id: "42", name: "Algorithms" }],
        },
      },
      repo: {
        ...sampleBackendSettings.repo,
        directory_layout: undefined as unknown as "flat",
      },
      active_tab: undefined as unknown as "lms",
      collapsed_sections: undefined as unknown as string[],
    }

    const store = toStoreFormat(partial)

    expect(store.lms.canvas.baseUrl).toBe("https://canvas.tue.nl")
    expect(store.lms.canvas.urlOption).toBe("TUE")
    expect(store.repo.directoryLayout).toBe("flat")
    expect(store.ui.activeTab).toBe("lms")
    expect(store.ui.collapsedSections).toEqual([])
  })

  it("uses default log levels when logging is missing", () => {
    const store = toStoreFormat({
      ...sampleBackendSettings,
      logging: undefined as unknown as GuiSettings["logging"],
    })

    expect(store.repo.logLevels).toEqual(DEFAULT_LOG_LEVELS)
  })

  it("defaults LMS type when missing", () => {
    const store = toStoreFormat({
      ...sampleBackendSettings,
      lms: {
        ...sampleBackendSettings.lms,
        type: null as unknown as "Canvas",
      },
    })

    expect(store.lms.lmsType).toBe(DEFAULT_LMS_SETTINGS.lmsType)
  })

  it("maps git settings correctly", () => {
    const store = toStoreFormat(sampleBackendSettings)

    expect(store.repo.gitServerType).toBe("GitLab")
    expect(store.repo.gitlab.accessToken).toBe("token123")
    expect(store.repo.gitlab.baseUrl).toBe("https://gitlab.example.com")
    expect(store.repo.gitlab.user).toBe("user1")
  })

  it("coerces string unions correctly in toBackendFormat", () => {
    const lmsState = {
      ...toStoreFormat(sampleBackendSettings).lms,
      lmsType: "Canvas" as const,
      canvas: {
        ...toStoreFormat(sampleBackendSettings).lms.canvas,
        urlOption: "CUSTOM" as const,
      },
      memberOption: "email" as const,
    }
    const repoState = {
      ...toStoreFormat(sampleBackendSettings).repo,
      directoryLayout: "flat" as const,
    }
    const uiState = {
      activeTab: "repo" as const,
      collapsedSections: ["lms-config"],
      sidebarOpen: false,
      theme: DEFAULT_GUI_THEME,
      windowWidth: 800,
      windowHeight: 600,
    }

    const backend = toBackendFormat(lmsState, repoState, uiState)

    expect(backend.lms.canvas.url_option).toBe("CUSTOM")
    expect(backend.repo.directory_layout).toBe("flat")
    expect(backend.active_tab).toBe("repo")
    expect(backend.logging).toEqual({
      info: repoState.logLevels.info,
      debug: repoState.logLevels.debug,
      warning: repoState.logLevels.warning,
      error: repoState.logLevels.error,
    })
  })

  it("preserves all server configs in round-trip", () => {
    const settings: GuiSettings = {
      ...sampleBackendSettings,
      git: {
        type: "GitHub",
        github: {
          access_token: "gh-token",
          user: "ghuser",
          student_repos_org: "gh-org",
          template_org: "gh-templates",
        },
        gitlab: {
          access_token: "gl-token",
          base_url: "https://gitlab.example.com",
          user: "gluser",
          student_repos_group: "gl-group",
          template_group: "gl-templates",
        },
        gitea: {
          access_token: "gt-token",
          base_url: "https://gitea.example.com",
          user: "gtuser",
          student_repos_group: "gt-group",
          template_group: "gt-templates",
        },
      },
    }

    const store = toStoreFormat(settings)

    // Check all configs are preserved
    expect(store.repo.github.accessToken).toBe("gh-token")
    expect(store.repo.github.user).toBe("ghuser")
    expect(store.repo.github.studentReposOrg).toBe("gh-org")
    expect(store.repo.github.templateOrg).toBe("gh-templates")
    expect(store.repo.gitlab.accessToken).toBe("gl-token")
    expect(store.repo.gitlab.baseUrl).toBe("https://gitlab.example.com")
    expect(store.repo.gitlab.studentReposGroup).toBe("gl-group")
    expect(store.repo.gitlab.templateGroup).toBe("gl-templates")
    expect(store.repo.gitea.accessToken).toBe("gt-token")
    expect(store.repo.gitea.baseUrl).toBe("https://gitea.example.com")
    expect(store.repo.gitea.studentReposGroup).toBe("gt-group")
    expect(store.repo.gitea.templateGroup).toBe("gt-templates")

    // Round-trip preserves everything
    const roundTrip = toBackendFormat(store.lms, store.repo, {
      activeTab: store.ui.activeTab,
      collapsedSections: store.ui.collapsedSections,
      sidebarOpen: store.ui.sidebarOpen,
      theme: settings.theme,
      windowWidth: settings.window_width,
      windowHeight: settings.window_height,
    })

    expect(roundTrip.git).toEqual(settings.git)
  })
})
