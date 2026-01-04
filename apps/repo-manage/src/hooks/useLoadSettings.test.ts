import { act, renderHook, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { DEFAULT_LOG_LEVELS } from "../constants"
import type { GuiSettings } from "../types/settings"
import { useLoadSettings } from "./useLoadSettings"

vi.mock("../services/settingsService")

import * as settingsService from "../services/settingsService"

const mockService = vi.mocked(settingsService)

const guiSettings: GuiSettings = {
  git: {
    type: "GitLab",
    github: {
      access_token: "",
      user: "",
      student_repos_org: "",
      template_org: "",
    },
    gitlab: {
      access_token: "token",
      base_url: "https://gitlab.example.com",
      user: "user",
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
    active_course_index: 0,
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
  collapsed_sections: [],
  theme: "system",
  sidebar_open: true,
  window_width: 1200,
  window_height: 900,
  logging: { ...DEFAULT_LOG_LEVELS },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockService.settingsExist.mockResolvedValue(true)
  mockService.loadSettingsWithWarnings.mockResolvedValue({
    settings: guiSettings,
    warnings: [],
  })
  mockService.getActiveProfile.mockResolvedValue("Work")
  mockService.getDefaultSettings.mockResolvedValue(guiSettings)
})

describe("useLoadSettings", () => {
  it("loads existing settings and logs the active profile", async () => {
    const onLoaded = vi.fn()
    const log = vi.fn()

    renderHook(() =>
      useLoadSettings({
        onLoaded,
        onForceDirty: vi.fn(),
        log,
      }),
    )

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(guiSettings))
    expect(log).toHaveBeenCalledWith("✓ Settings loaded from profile: Work")
    expect(mockService.loadAppSettings).not.toHaveBeenCalled()
  })

  it("logs creation message when settings file is missing", async () => {
    mockService.settingsExist.mockResolvedValueOnce(false)
    mockService.getActiveProfile.mockResolvedValueOnce(null)
    const log = vi.fn()

    renderHook(() =>
      useLoadSettings({
        onLoaded: vi.fn(),
        onForceDirty: vi.fn(),
        log,
      }),
    )

    await waitFor(() =>
      expect(log).toHaveBeenCalledWith("✓ Created profile: Default"),
    )
  })

  it("emits warnings and forces dirty state", async () => {
    mockService.loadSettingsWithWarnings.mockResolvedValueOnce({
      settings: guiSettings,
      warnings: ["Fixed path", "Added missing field"],
    })
    const log = vi.fn()
    const onForceDirty = vi.fn()

    renderHook(() =>
      useLoadSettings({
        onLoaded: vi.fn(),
        onForceDirty,
        log,
      }),
    )

    await waitFor(() => expect(onForceDirty).toHaveBeenCalled())
    expect(log).toHaveBeenCalledWith("⚠ Fixed path")
    expect(log).toHaveBeenCalledWith("⚠ Added missing field")
    expect(log).toHaveBeenCalledWith(
      "→ Click Save to persist corrected settings.",
    )
  })

  it("falls back to defaults on error and forces dirty state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      mockService.loadSettingsWithWarnings.mockRejectedValueOnce(
        new Error("boom"),
      )
      mockService.getActiveProfile.mockResolvedValueOnce("Broken")
      const onLoaded = vi.fn()
      const onForceDirty = vi.fn()
      const log = vi.fn()

      renderHook(() =>
        useLoadSettings({
          onLoaded,
          onForceDirty,
          log,
        }),
      )

      await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(guiSettings))
      expect(onForceDirty).toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(
        "⚠ Failed to load profile 'Broken':\nboom",
      )
      expect(log).toHaveBeenCalledWith(
        "→ Using default settings for profile 'Broken'.",
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it("loads only once on mount even if rerendered", async () => {
    const onLoaded = vi.fn()
    const log = vi.fn()

    const { rerender, result } = renderHook(() =>
      useLoadSettings({
        onLoaded,
        onForceDirty: vi.fn(),
        log,
      }),
    )

    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1))

    rerender()

    await waitFor(() =>
      expect(mockService.loadSettingsWithWarnings).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      await result.current.loadSettings()
    })

    expect(mockService.loadSettingsWithWarnings).toHaveBeenCalledTimes(2)
  })
})
