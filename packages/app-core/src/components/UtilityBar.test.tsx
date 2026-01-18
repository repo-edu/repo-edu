import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { useOutputStore } from "../stores/outputStore"
import { useProfileStore } from "../stores/profileStore"
import { useUiStore } from "../stores/uiStore"
import { UtilityBar } from "./UtilityBar"

vi.mock("../bindings/commands", () => ({
  commands: {
    revealProfilesDirectory: vi.fn(),
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

  it("navigates to roster tab when profile indicator is clicked", () => {
    useUiStore.getState().setActiveProfile("CS101 2026")
    render(<UtilityBar isDirty={false} onSaved={() => {}} />)

    const profileButton = screen.getByTitle(
      "Click to manage profiles in Roster tab",
    )
    fireEvent.click(profileButton)

    expect(useUiStore.getState().activeTab).toBe("roster")
  })

  it("has Clear button that clears output", () => {
    useOutputStore.getState().appendText("Test message", "info")
    render(<UtilityBar isDirty={false} onSaved={() => {}} />)

    const clearButton = screen.getByText("Clear")
    fireEvent.click(clearButton)

    expect(useOutputStore.getState().lines).toHaveLength(0)
  })
})
