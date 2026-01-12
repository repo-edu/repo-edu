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
    const { result } = renderHook(() => useDirtyState("test-profile"))
    expect(result.current.isDirty).toBe(false)
  })

  it("detects changes to profile settings", () => {
    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    // Initial state is clean
    expect(result.current.isDirty).toBe(false)

    // Mutate profile settings
    act(() => {
      useProfileSettingsStore.setState({ gitConnection: "my-github" })
    })
    rerender()

    expect(result.current.isDirty).toBe(true)
  })

  it("detects changes to roster", () => {
    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    // Initial state is clean
    expect(result.current.isDirty).toBe(false)

    // Mutate roster
    act(() => {
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
    })
    rerender()

    expect(result.current.isDirty).toBe(true)
  })

  it("markClean resets baseline to current state", () => {
    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    // Mutate profile settings
    act(() => {
      useProfileSettingsStore.setState({ gitConnection: "my-github" })
    })
    rerender()
    expect(result.current.isDirty).toBe(true)

    // Mark clean and rerender
    act(() => result.current.markClean())
    rerender()
    expect(result.current.isDirty).toBe(false)
  })

  it("forceDirty invalidates baselines", () => {
    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    expect(result.current.isDirty).toBe(false)

    // Force dirty and rerender
    act(() => result.current.forceDirty())
    rerender()
    expect(result.current.isDirty).toBe(true)
  })

  it("returns clean when profile changes (baseline mismatch)", () => {
    const { result, rerender } = renderHook(
      ({ profile }) => useDirtyState(profile),
      { initialProps: { profile: "profile-a" } },
    )

    // Make dirty by changing store
    act(() => {
      useProfileSettingsStore.setState({ gitConnection: "my-github" })
    })
    rerender({ profile: "profile-a" })
    expect(result.current.isDirty).toBe(true)

    // Switch to a different profile - baseline was for profile-a, now profile-b
    // Should be clean because baseline doesn't match current profile
    act(() => {
      rerender({ profile: "profile-b" })
    })
    expect(result.current.isDirty).toBe(false)
  })

  it("becomes dirty again after markClean on new profile and subsequent changes", () => {
    const { result, rerender } = renderHook(
      ({ profile }) => useDirtyState(profile),
      { initialProps: { profile: "profile-a" } },
    )

    // Switch profile
    act(() => {
      rerender({ profile: "profile-b" })
    })
    expect(result.current.isDirty).toBe(false)

    // Mark clean to capture baseline for new profile
    act(() => result.current.markClean())
    act(() => {
      rerender({ profile: "profile-b" })
    })
    expect(result.current.isDirty).toBe(false)

    // Now make changes - should become dirty
    act(() => {
      useProfileSettingsStore.setState({ gitConnection: "changed-connection" })
    })
    act(() => {
      rerender({ profile: "profile-b" })
    })
    expect(result.current.isDirty).toBe(true)
  })

  it("can force dirty after switching profiles", () => {
    const { result, rerender } = renderHook(
      ({ profile }) => useDirtyState(profile),
      { initialProps: { profile: "profile-a" } },
    )

    act(() => {
      rerender({ profile: "profile-b" })
    })
    expect(result.current.isDirty).toBe(false)

    act(() => result.current.forceDirty())
    rerender({ profile: "profile-b" })
    expect(result.current.isDirty).toBe(true)
  })
})
