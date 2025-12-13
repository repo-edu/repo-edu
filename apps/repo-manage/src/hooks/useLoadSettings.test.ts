import { act, renderHook, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { DEFAULT_LOG_LEVELS } from "../constants"
import type { GuiSettings } from "../types/settings"
import { useLoadSettings } from "./useLoadSettings"

vi.mock("../services/settingsService")

import * as settingsService from "../services/settingsService"

const mockService = vi.mocked(settingsService)

const guiSettings: GuiSettings = {
  common: {
    git_base_url: "https://gitlab.example.com",
    git_access_token: "token",
    git_user: "user",
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
  mockService.loadAppSettings.mockResolvedValue({
    window_width: 111,
    window_height: 222,
  })
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
      mockService.loadAppSettings.mockResolvedValueOnce({
        theme: "dark",
        window_width: 500,
        window_height: 400,
      })
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

      await waitFor(() =>
        expect(onLoaded).toHaveBeenCalledWith(
          expect.objectContaining({ window_width: 500, window_height: 400 }),
        ),
      )
      expect(onForceDirty).toHaveBeenCalled()
      expect(mockService.loadAppSettings).toHaveBeenCalledTimes(1)
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
