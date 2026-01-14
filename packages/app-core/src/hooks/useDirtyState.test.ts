import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useProfileStore } from "../stores/profileStore"
import { useDirtyState } from "./useDirtyState"

// Default document for testing
const createDefaultDocument = () => ({
  settings: {
    course: { id: "", name: "" },
    git_connection: null,
    operations: {
      target_org: "",
      repo_name_template: "{assignment}-{group}",
      create: { template_org: "" },
      clone: { target_dir: "", directory_layout: "flat" as const },
      delete: {},
    },
    exports: {
      output_folder: "",
      output_csv: false,
      output_xlsx: false,
      output_yaml: true,
      csv_file: "student-info.csv",
      xlsx_file: "student-info.xlsx",
      yaml_file: "students.yaml",
      member_option: "(email, gitid)" as const,
      include_group: true,
      include_member: true,
      include_initials: false,
      full_groups: true,
    },
  },
  roster: null,
  resolvedIdentityMode: "username" as const,
})

beforeEach(() => {
  // Reset store to initial state before each test
  useProfileStore.getState().reset()
})

describe("useDirtyState", () => {
  it("starts clean when stores are in initial state", () => {
    const { result } = renderHook(() => useDirtyState("test-profile"))
    expect(result.current.isDirty).toBe(false)
  })

  it("detects changes to profile settings", () => {
    // Set up initial document state
    act(() => {
      useProfileStore.setState({
        document: createDefaultDocument(),
        status: "loaded",
      })
    })

    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    // Mark clean to establish baseline
    act(() => result.current.markClean())
    rerender()

    // Initial state is clean
    expect(result.current.isDirty).toBe(false)

    // Mutate profile settings via store action
    act(() => {
      useProfileStore.getState().setGitConnection("my-github")
    })
    rerender()

    expect(result.current.isDirty).toBe(true)
  })

  it("detects changes to roster", () => {
    // Set up initial document state
    act(() => {
      useProfileStore.setState({
        document: createDefaultDocument(),
        status: "loaded",
      })
    })

    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    // Mark clean to establish baseline
    act(() => result.current.markClean())
    rerender()

    // Initial state is clean
    expect(result.current.isDirty).toBe(false)

    // Mutate roster via store action
    act(() => {
      useProfileStore.getState().addStudent({
        id: "s1",
        name: "Test",
        email: "test@example.com",
        student_number: null,
        git_username: null,
        git_username_status: "unknown",
        lms_user_id: null,
        custom_fields: {},
      })
    })
    rerender()

    expect(result.current.isDirty).toBe(true)
  })

  it("markClean resets baseline to current state", () => {
    // Set up initial document state
    act(() => {
      useProfileStore.setState({
        document: createDefaultDocument(),
        status: "loaded",
      })
    })

    const { result, rerender } = renderHook(() => useDirtyState("test-profile"))

    // Mark clean to establish baseline
    act(() => result.current.markClean())
    rerender()

    // Mutate profile settings
    act(() => {
      useProfileStore.getState().setGitConnection("my-github")
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
    // Set up initial document state
    act(() => {
      useProfileStore.setState({
        document: createDefaultDocument(),
        status: "loaded",
      })
    })

    const { result, rerender } = renderHook(
      ({ profile }) => useDirtyState(profile),
      { initialProps: { profile: "profile-a" } },
    )

    // Mark clean to establish baseline for profile-a
    act(() => result.current.markClean())
    rerender({ profile: "profile-a" })

    // Make dirty by changing store
    act(() => {
      useProfileStore.getState().setGitConnection("my-github")
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
    // Set up initial document state
    act(() => {
      useProfileStore.setState({
        document: createDefaultDocument(),
        status: "loaded",
      })
    })

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
      useProfileStore.getState().setGitConnection("changed-connection")
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
