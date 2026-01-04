import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"
import { useDirtyState } from "./useDirtyState"

beforeEach(() => {
  // Reset stores to initial state before each test
  useProfileSettingsStore.getState().reset()
  useRosterStore.getState().reset()
})

describe("useDirtyState", () => {
  it("starts clean when stores are in initial state", () => {
    const { result } = renderHook(() => useDirtyState())
    expect(result.current.isDirty).toBe(false)
  })

  it("detects changes to profile settings", () => {
    const { result, rerender } = renderHook(() => useDirtyState())

    // Initial state is clean
    expect(result.current.isDirty).toBe(false)

    // Mutate profile settings
    useProfileSettingsStore.setState({ gitConnection: "my-github" })
    rerender()

    expect(result.current.isDirty).toBe(true)
  })

  it("detects changes to roster", () => {
    const { result, rerender } = renderHook(() => useDirtyState())

    // Initial state is clean
    expect(result.current.isDirty).toBe(false)

    // Mutate roster
    useRosterStore.setState({
      roster: {
        source: null,
        students: [
          {
            id: "s1",
            name: "Test",
            email: "test@example.com",
            student_number: null,
            git_username: null,
            git_username_status: "unknown",
            lms_user_id: null,
            custom_fields: {},
          },
        ],
        assignments: [],
      },
      status: "loaded",
    })
    rerender()

    expect(result.current.isDirty).toBe(true)
  })

  it("markClean resets baseline to current state", () => {
    const { result, rerender } = renderHook(() => useDirtyState())

    // Mutate profile settings
    useProfileSettingsStore.setState({ gitConnection: "my-github" })
    rerender()
    expect(result.current.isDirty).toBe(true)

    // Mark clean and rerender (refs don't trigger rerenders)
    act(() => result.current.markClean())
    rerender()
    expect(result.current.isDirty).toBe(false)
  })

  it("forceDirty invalidates baselines", () => {
    const { result, rerender } = renderHook(() => useDirtyState())

    expect(result.current.isDirty).toBe(false)

    // Force dirty and rerender (refs don't trigger rerenders)
    act(() => result.current.forceDirty())
    rerender()
    expect(result.current.isDirty).toBe(true)
  })
})
