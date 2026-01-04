import { act, renderHook } from "@testing-library/react"
import { vi } from "vitest"
import { DEFAULT_GUI_THEME, DEFAULT_LOG_LEVELS } from "../constants"
import type { GuiSettings } from "../types/settings"
import { useAppSettings } from "./useAppSettings"

vi.mock("../services/settingsService")

import * as settingsService from "../services/settingsService"

const mockService = vi.mocked(settingsService)

const existingAppSettings = {
  theme: "light",
  logging: { ...DEFAULT_LOG_LEVELS },
  lms_connection: null,
  git_connections: {},
}

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
    canvas: {
      access_token: "",
      base_url: "",
      courses: [],
      custom_url: "",
      url_option: "TUE",
    },
    moodle: {
      access_token: "",
      base_url: "",
      courses: [],
    },
    type: "Canvas",
    active_course_index: 0,
    csv_file: "",
    full_groups: false,
    include_group: false,
    include_initials: false,
    include_member: false,
    member_option: "(email, gitid)",
    output_csv: false,
    output_folder: "",
    output_xlsx: false,
    output_yaml: false,
    xlsx_file: "",
    yaml_file: "",
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
  mockService.loadAppSettings.mockResolvedValue(existingAppSettings)
  mockService.saveAppSettings.mockResolvedValue(undefined)
})

describe("useAppSettings", () => {
  it("is a no-op when currentGuiSettings is null", async () => {
    const { result } = renderHook(() => useAppSettings({}))

    await act(async () => {
      await result.current.saveAppSettings()
    })

    expect(mockService.saveAppSettings).not.toHaveBeenCalled()
    expect(mockService.loadAppSettings).not.toHaveBeenCalled()
  })

  it("saves using defaults when theme/logging are missing", async () => {
    const settings = {
      ...baseSettings,
      theme: null as unknown as "light",
      logging: undefined as unknown as GuiSettings["logging"],
    }
    const getLogging = vi.fn(() => ({
      info: true,
      debug: true,
      warning: true,
      error: true,
    }))
    const { result } = renderHook(() =>
      useAppSettings({
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
    expect(mockService.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: DEFAULT_GUI_THEME,
        logging: getLogging(),
        git_connections: existingAppSettings.git_connections,
      }),
    )
  })

  it("merges overrides after computed settings", async () => {
    const settings = { ...baseSettings }
    const overrides = {
      theme: "dark" as const,
    }
    const { result } = renderHook(() => useAppSettings({}))

    act(() => {
      result.current.setCurrentGuiSettings(settings)
    })

    await act(async () => {
      await result.current.saveAppSettings(overrides)
    })

    expect(mockService.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        ...overrides,
        git_connections: existingAppSettings.git_connections,
      }),
    )
  })
})
