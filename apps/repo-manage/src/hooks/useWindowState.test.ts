import { act, renderHook } from "@testing-library/react"
import { vi } from "vitest"
import { useWindowState } from "./useWindowState"

const setSize = vi.fn()
const center = vi.fn()
const show = vi.fn()

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize,
    center,
    show,
  }),
  PhysicalSize: class {
    width: number
    height: number
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }
  },
}))

describe("useWindowState", () => {
  beforeEach(() => {
    setSize.mockClear()
    center.mockClear()
    show.mockClear()
  })

  it("restores window once and shows it", async () => {
    const { rerender } = renderHook(() =>
      useWindowState({
        config: { width: 1200, height: 800 },
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(setSize).toHaveBeenCalledTimes(1)
    expect(center).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)

    rerender()

    // Should not restore again on re-render
    expect(setSize).toHaveBeenCalledTimes(1)
  })

  it("skips restore when config is null", async () => {
    renderHook(() =>
      useWindowState({
        config: null,
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(setSize).not.toHaveBeenCalled()
    expect(center).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
  })

  it("returns saveWindowState function", () => {
    const { result } = renderHook(() =>
      useWindowState({
        config: { width: 800, height: 600 },
      }),
    )

    expect(typeof result.current.saveWindowState).toBe("function")
  })
})
