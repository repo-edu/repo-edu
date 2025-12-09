import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useDirtyState } from "./useDirtyState"

describe("useDirtyState", () => {
  it("tracks dirty -> clean -> dirty transitions", () => {
    let lms = { a: 1 }
    let repo = { b: 1 }

    const { result, rerender } = renderHook(() =>
      useDirtyState({
        getLmsState: () => lms,
        getRepoState: () => repo,
      }),
    )

    // initial baselines equal current
    expect(result.current.isDirty).toBe(false)

    // mutate repo -> rerender to pick up change
    repo = { b: 2 }
    rerender()
    expect(result.current.isDirty).toBe(true)

    // mark clean -> resets baseline to current
    act(() => result.current.markClean())
    expect(result.current.isDirty).toBe(false)

    // force dirty -> baseline invalidated
    act(() => result.current.forceDirty())
    expect(result.current.isDirty).toBe(true)
  })
})
