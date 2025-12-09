import { describe, expect, it } from "vitest"
import { DEFAULT_GUI_THEME, DEFAULT_LOG_LEVELS } from "../constants"
import type { GuiSettings } from "../types/settings"
import { toBackendFormat, toStoreFormat } from "./settingsAdapter"

const sampleBackendSettings: GuiSettings = {
  common: {
    git_base_url: "https://gitlab.example.com",
    git_access_token: "token123",
    git_user: "user1",
  },
  lms: {
    type: "Canvas",
    base_url: "https://canvas.example.com",
    custom_url: "",
    url_option: "TUE",
    access_token: "lms-token",
    course_id: "42",
    course_name: "Algorithms",
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
    student_repos_group: "group/students",
    template_group: "group/templates",
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
        base_url: "",
        custom_url: "",
        url_option: undefined as unknown as "TUE",
      },
      repo: {
        ...sampleBackendSettings.repo,
        directory_layout: undefined as unknown as "flat",
      },
      active_tab: undefined as unknown as "lms",
      collapsed_sections: undefined as unknown as string[],
    }

    const store = toStoreFormat(partial)

    expect(store.lms.baseUrl).toBe("https://canvas.tue.nl")
    expect(store.lms.urlOption).toBe("TUE")
    expect(store.repo.directoryLayout).toBe("flat")
    expect(store.ui.activeTab).toBe("lms")
    expect(store.ui.collapsedSections).toEqual([])
  })
})
