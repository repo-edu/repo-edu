import { act, renderHook } from "@testing-library/react"
import { vi } from "vitest"
import { DEFAULT_GUI_THEME, DEFAULT_LOG_LEVELS } from "../constants"
import type { GuiSettings } from "../types/settings"
import { useAppSettings } from "./useAppSettings"

const { innerSize, getCurrentWindow } = vi.hoisted(() => {
  const innerSize = vi.fn()
  const getCurrentWindow = vi.fn(() => ({
    innerSize,
  }))
  return { innerSize, getCurrentWindow }
})

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow,
}))

vi.mock("../services/settingsService")

import * as settingsService from "../services/settingsService"

const mockService = vi.mocked(settingsService)

const baseSettings: GuiSettings = {
  git: {
    type: "GitLab",
    github: {
      access_token: "",
      user: "",
      student_repos_org: "",
      template_org: "",
    },
    gitlab: {
      access_token: "",
      base_url: "",
      user: "",
      student_repos_group: "",
      template_group: "",
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
    base_url: "",
    custom_url: "",
    url_option: "TUE",
    access_token: "",
    course_id: "",
    course_name: "",
    yaml_file: "students.yaml",
    output_folder: "",
    csv_file: "",
    xlsx_file: "",
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
    yaml_file: "",
    target_folder: "",
    assignments: "",
    directory_layout: "flat",
  },
  active_tab: "lms",
  collapsed_sections: [],
  theme: "system",
  sidebar_open: false,
  window_width: 1000,
  window_height: 800,
  logging: { ...DEFAULT_LOG_LEVELS },
}

beforeEach(() => {
  vi.clearAllMocks()
  innerSize.mockResolvedValue({ width: 640, height: 480 })
  mockService.saveAppSettings.mockResolvedValue(undefined)
})

describe("useAppSettings", () => {
  it("is a no-op when currentGuiSettings is null", async () => {
    const { result } = renderHook(() =>
      useAppSettings({
        getUiState: () => ({
          activeTab: "lms",
          collapsedSections: [],
          settingsMenuOpen: false,
        }),
      }),
    )

    await act(async () => {
      await result.current.saveAppSettings()
    })

    expect(getCurrentWindow).not.toHaveBeenCalled()
    expect(mockService.saveAppSettings).not.toHaveBeenCalled()
  })

  it("saves using defaults when theme/logging are missing", async () => {
    const settings = {
      ...baseSettings,
      theme: null as unknown as "light",
      logging: undefined as unknown as GuiSettings["logging"],
    }
    const getUiState = vi.fn(() => ({
      activeTab: "repo",
      collapsedSections: ["lms-config"],
      settingsMenuOpen: true,
    }))
    const getLogging = vi.fn(() => ({
      info: true,
      debug: true,
      warning: true,
      error: true,
    }))
    const { result } = renderHook(() =>
      useAppSettings({
        getUiState,
        getLogging,
      }),
    )

    act(() => {
      result.current.setCurrentGuiSettings(settings)
    })

    await act(async () => {
      await result.current.saveAppSettings()
    })

    expect(getLogging).toHaveBeenCalled()
    expect(getUiState).toHaveBeenCalled()
    expect(mockService.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: DEFAULT_GUI_THEME,
        logging: getLogging(),
        active_tab: "repo",
        collapsed_sections: ["lms-config"],
        sidebar_open: true,
        window_width: 640,
        window_height: 480,
      }),
    )
  })

  it("merges overrides after computed settings", async () => {
    const settings = { ...baseSettings }
    const overrides = {
      window_width: 2000,
      window_height: 1000,
      sidebar_open: true,
      theme: "dark" as const,
    }
    const getUiState = vi.fn(() => ({
      activeTab: "lms",
      collapsedSections: [],
      settingsMenuOpen: false,
    }))
    const { result } = renderHook(() =>
      useAppSettings({
        getUiState,
      }),
    )

    act(() => {
      result.current.setCurrentGuiSettings(settings)
    })

    await act(async () => {
      await result.current.saveAppSettings(overrides)
    })

    expect(getUiState).toHaveBeenCalled()
    expect(mockService.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining(overrides),
    )
  })
})
