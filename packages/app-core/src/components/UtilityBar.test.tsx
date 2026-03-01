import { render, screen } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { useProfileStore } from "../stores/profileStore"
import { useUiStore } from "../stores/uiStore"
import { UtilityBar } from "./UtilityBar"

vi.mock("../bindings/commands", () => ({
  commands: {
    revealProfilesDirectory: vi.fn(),
    listProfiles: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    loadProfileSettings: vi.fn(),
    setActiveProfile: vi.fn(),
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
    vi.clearAllMocks()
  })

  it("shows profile indicator with 'None' when no profile is active", () => {
    render(<UtilityBar isDirty={false} onSaved={() => {}} />)

    expect(screen.getByText("Profile:")).toBeInTheDocument()
    expect(screen.getByText("None")).toBeInTheDocument()
  })

  it("shows active profile name when profile is set", () => {
    useUiStore.getState().setActiveProfile("CS101 2026")
    render(<UtilityBar isDirty={false} onSaved={() => {}} />)

    expect(screen.getByText("CS101 2026")).toBeInTheDocument()
  })
})
