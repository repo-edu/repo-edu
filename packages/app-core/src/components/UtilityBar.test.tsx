import { render, waitFor } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { useOutputStore } from "../stores/outputStore"
import { useProfileStore } from "../stores/profileStore"
import { useUiStore } from "../stores/uiStore"
import { UtilityBar } from "./UtilityBar"

const commandMocks = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  loadProfileSettings: vi.fn(),
  loadProfile: vi.fn(),
}))

vi.mock("../bindings/commands", () => ({
  commands: {
    listProfiles: commandMocks.listProfiles,
    loadProfileSettings: commandMocks.loadProfileSettings,
    loadProfile: commandMocks.loadProfile,
  },
}))

describe("UtilityBar", () => {
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  })

  beforeEach(() => {
    useUiStore.getState().reset()
    useProfileStore.getState().reset()
    useOutputStore.getState().clear()
    vi.clearAllMocks()

    commandMocks.listProfiles.mockResolvedValue({
      status: "ok",
      data: ["CS101 2026", "CS201 2026"],
    })
    commandMocks.loadProfileSettings.mockImplementation(
      async (name: string) => ({
        status: "ok",
        data: {
          settings: { course: { id: "", name: `Course for ${name}` } },
          warnings: [],
        },
      }),
    )
  })

  it("refreshes profiles without loading or switching the active profile", async () => {
    render(
      <UtilityBar
        isDirty={false}
        onSaved={() => {}}
        onProfileLoadResult={() => {}}
      />,
    )

    await waitFor(() =>
      expect(commandMocks.listProfiles).toHaveBeenCalledTimes(1),
    )
    await waitFor(() =>
      expect(commandMocks.loadProfileSettings).toHaveBeenCalledTimes(2),
    )
    expect(commandMocks.loadProfile).not.toHaveBeenCalled()
  })
})
