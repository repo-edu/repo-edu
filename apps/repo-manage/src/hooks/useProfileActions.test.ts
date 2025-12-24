import { act, renderHook, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { DEFAULT_LOG_LEVELS } from "../constants"
import type { GuiSettings, ProfileSettings } from "../types/settings"
import { useProfileActions } from "./useProfileActions"

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
      access_token: "t",
      base_url: "https://gitlab.example.com",
      user: "u",
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
    base_url: "https://canvas.example.com",
    custom_url: "",
    url_option: "TUE",
    access_token: "token",
    course_id: "42",
    course_name: "Algorithms",
    yaml_file: "students.yaml",
    output_folder: "/tmp",
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

const baseProfileSettings: ProfileSettings = {
  git: baseSettings.git,
  lms: baseSettings.lms,
  repo: baseSettings.repo,
}

function cloneSettings(overrides: Partial<GuiSettings> = {}) {
  return {
    ...baseSettings,
    ...overrides,
    lms: { ...baseSettings.lms, ...overrides.lms },
    repo: { ...baseSettings.repo, ...overrides.repo },
  }
}

function setup(options?: Partial<Parameters<typeof useProfileActions>[0]>) {
  const getProfileSettings = vi.fn(() => baseProfileSettings)
  const onSettingsLoaded = vi.fn()
  const onMessage = vi.fn()
  const onSaved = vi.fn()
  const onSuccess = vi.fn()

  const hook = renderHook(() =>
    useProfileActions({
      getProfileSettings,
      onSettingsLoaded,
      onMessage,
      onSaved,
      onSuccess,
      ...options,
    }),
  )

  return {
    hook,
    getProfileSettings,
    onSettingsLoaded,
    onMessage,
    onSaved,
    onSuccess,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockService.getSettingsPath.mockResolvedValue("/settings")
  mockService.listProfiles.mockResolvedValue(["Default"])
  mockService.getActiveProfile.mockResolvedValue("Default")
  mockService.getDefaultSettings.mockResolvedValue(cloneSettings())
  mockService.saveProfile.mockResolvedValue(undefined)
  mockService.loadProfile.mockResolvedValue({
    settings: cloneSettings({ active_tab: "repo" }),
    warnings: [],
  })
  mockService.setActiveProfile.mockResolvedValue(undefined)
  mockService.renameProfile.mockResolvedValue(undefined)
  mockService.deleteProfile.mockResolvedValue(undefined)
})

describe("useProfileActions", () => {
  it("saves active profile successfully", async () => {
    const { hook, onMessage, onSaved } = setup()

    await waitFor(() =>
      expect(hook.result.current.activeProfile).toBe("Default"),
    )

    await act(async () => {
      await hook.result.current.saveProfile()
    })

    expect(mockService.saveProfile).toHaveBeenCalledWith(
      "Default",
      expect.objectContaining({
        git: expect.any(Object),
        lms: expect.any(Object),
        repo: expect.any(Object),
      }),
    )
    expect(onMessage).toHaveBeenCalledWith("✓ Saved profile: Default")
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it("reports failure when saveProfile throws", async () => {
    mockService.saveProfile.mockRejectedValueOnce(new Error("boom"))
    const { hook, onMessage } = setup()
    await waitFor(() =>
      expect(hook.result.current.activeProfile).toBe("Default"),
    )

    await act(async () => {
      await hook.result.current.saveProfile()
    })

    expect(onMessage).toHaveBeenCalledWith("✗ Failed to save profile: boom")
  })

  it("reverts profile successfully", async () => {
    const reverted = cloneSettings({ active_tab: "repo" })
    mockService.loadProfile.mockResolvedValueOnce({
      settings: reverted,
      warnings: [],
    })
    const { hook, onSettingsLoaded, onMessage } = setup()
    await waitFor(() =>
      expect(hook.result.current.activeProfile).toBe("Default"),
    )

    await act(async () => {
      await hook.result.current.revertProfile()
    })

    expect(onSettingsLoaded).toHaveBeenCalledWith(reverted, true)
    expect(onMessage).toHaveBeenCalledWith("✓ Reverted to saved: Default")
  })

  it("reports revert failure", async () => {
    mockService.loadProfile.mockRejectedValueOnce(new Error("missing"))
    const { hook, onMessage } = setup()
    await waitFor(() =>
      expect(hook.result.current.activeProfile).toBe("Default"),
    )

    await act(async () => {
      await hook.result.current.revertProfile()
    })

    expect(onMessage).toHaveBeenCalledWith(
      "✗ Failed to revert profile: missing",
    )
  })

  it("loads profile and updates active profile", async () => {
    mockService.loadProfile.mockResolvedValueOnce({
      settings: cloneSettings({ active_tab: "repo" }),
      warnings: [],
    })
    const { hook, onMessage, onSettingsLoaded } = setup()

    await act(async () => {
      await hook.result.current.loadProfile("Work")
    })

    expect(mockService.loadProfile).toHaveBeenCalledWith("Work")
    expect(mockService.setActiveProfile).toHaveBeenCalledWith("Work")
    expect(onSettingsLoaded).toHaveBeenCalledWith(expect.any(Object), true)
    expect(onMessage).toHaveBeenCalledWith("✓ Loaded profile: Work")
    expect(hook.result.current.activeProfile).toBe("Work")
  })

  it("falls back to defaults when loadProfile fails", async () => {
    mockService.loadProfile.mockRejectedValueOnce(new Error("corrupt"))
    mockService.getDefaultSettings.mockResolvedValueOnce(
      cloneSettings({
        lms: { ...baseSettings.lms, base_url: "https://default.example.com" },
      }),
    )
    const { hook, onMessage, onSettingsLoaded } = setup()

    await act(async () => {
      await hook.result.current.loadProfile("Broken")
    })

    expect(onSettingsLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        lms: expect.objectContaining({
          base_url: "https://default.example.com",
        }),
      }),
      false,
    )
    expect(onMessage).toHaveBeenCalledWith(
      expect.stringContaining("⚠ Failed to load profile 'Broken'"),
    )
  })

  it("creates profile by copying current settings", async () => {
    const { hook, getProfileSettings, onMessage } = setup()

    await act(async () => {
      await hook.result.current.createProfile("New", true)
    })

    expect(mockService.saveProfile).toHaveBeenCalledWith(
      "New",
      expect.any(Object),
    )
    expect(mockService.loadProfile).toHaveBeenCalledWith("New")
    expect(getProfileSettings).toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith(
      "✓ Created and activated profile: New",
    )
  })

  it("creates profile from defaults when not copying current", async () => {
    const defaultSettings = cloneSettings({
      git: {
        type: "GitLab",
        github: { access_token: "", user: "" },
        gitlab: {
          access_token: "x",
          base_url: "https://dflt.example.com",
          user: "y",
        },
        gitea: { access_token: "", base_url: "", user: "" },
      },
    })
    const defaultProfileSettings: ProfileSettings = {
      git: defaultSettings.git,
      lms: defaultSettings.lms,
      repo: defaultSettings.repo,
    }
    mockService.getDefaultSettings.mockResolvedValueOnce(defaultSettings)
    const { hook, getProfileSettings } = setup()

    await act(async () => {
      await hook.result.current.createProfile("Fresh", false)
    })

    expect(getProfileSettings).not.toHaveBeenCalled()
    expect(mockService.saveProfile).toHaveBeenCalledWith(
      "Fresh",
      defaultProfileSettings,
    )
  })

  it("renames profile successfully", async () => {
    const { hook, onMessage } = setup()
    await waitFor(() =>
      expect(hook.result.current.activeProfile).toBe("Default"),
    )

    await act(async () => {
      await hook.result.current.renameProfile("Renamed")
    })

    expect(mockService.renameProfile).toHaveBeenCalledWith("Default", "Renamed")
    expect(onMessage).toHaveBeenCalledWith("✓ Renamed profile to: Renamed")
    expect(hook.result.current.activeProfile).toBe("Renamed")
  })

  it("reports rename failure", async () => {
    mockService.renameProfile.mockRejectedValueOnce(new Error("nope"))
    const { hook, onMessage } = setup()
    await waitFor(() =>
      expect(hook.result.current.activeProfile).toBe("Default"),
    )

    await act(async () => {
      await hook.result.current.renameProfile("Renamed")
    })

    expect(onMessage).toHaveBeenCalledWith("✗ Failed to rename profile: nope")
  })

  it("deletes active profile and switches to another existing profile", async () => {
    mockService.listProfiles.mockResolvedValueOnce(["Work", "Default"])
    mockService.getActiveProfile.mockResolvedValueOnce("Work")
    mockService.loadProfile.mockResolvedValueOnce({
      settings: cloneSettings({ active_tab: "lms" }),
      warnings: [],
    })

    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.activeProfile).toBe("Work"))

    await act(async () => {
      await hook.result.current.deleteProfile()
    })

    expect(mockService.deleteProfile).toHaveBeenCalledWith("Work")
    expect(mockService.setActiveProfile).toHaveBeenCalledWith("Default")
    expect(hook.result.current.activeProfile).toBe("Default")
  })

  it("deletes last profile and recreates Default", async () => {
    mockService.listProfiles.mockResolvedValueOnce(["Solo"])
    mockService.getActiveProfile.mockResolvedValueOnce("Solo")
    const { hook, onMessage, getProfileSettings } = setup()
    await waitFor(() => expect(hook.result.current.activeProfile).toBe("Solo"))

    await act(async () => {
      await hook.result.current.deleteProfile()
    })

    expect(mockService.deleteProfile).toHaveBeenCalledWith("Solo")
    expect(mockService.saveProfile).toHaveBeenCalledWith(
      "Default",
      expect.objectContaining({
        git: expect.any(Object),
        lms: expect.any(Object),
        repo: expect.any(Object),
      }),
    )
    expect(mockService.setActiveProfile).toHaveBeenCalledWith("Default")
    expect(onMessage).toHaveBeenCalledWith("✓ Created new profile: Default")
    expect(getProfileSettings).toHaveBeenCalled()
  })

  it("refreshes profiles list and active profile", async () => {
    mockService.listProfiles.mockResolvedValueOnce(["Default", "Work"])
    mockService.getActiveProfile.mockResolvedValueOnce("Default")
    const { hook } = setup()
    await waitFor(() =>
      expect(hook.result.current.profiles).toEqual(["Default", "Work"]),
    )

    mockService.listProfiles.mockResolvedValueOnce(["Updated"])
    mockService.getActiveProfile.mockResolvedValueOnce("Updated")

    await act(async () => {
      await hook.result.current.refreshProfiles()
    })

    expect(hook.result.current.profiles).toEqual(["Updated"])
    expect(hook.result.current.activeProfile).toBe("Updated")
  })
})
