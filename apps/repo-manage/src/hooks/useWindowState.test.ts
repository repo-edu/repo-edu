import { act, renderHook } from "@testing-library/react"
import { vi } from "vitest"
import { RESIZE_DEBOUNCE_MS } from "../constants"
import { useWindowState } from "./useWindowState"

const setSize = vi.fn()
const center = vi.fn()
const show = vi.fn()
const onResized = vi.fn()

const unlisten = vi.fn()
let resizeHandler: (() => void) | undefined

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize,
    center,
    show,
    onResized: onResized.mockImplementation((cb: () => void) => {
      resizeHandler = cb
      return Promise.resolve(unlisten)
    }),
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
    vi.useFakeTimers()
    setSize.mockClear()
    center.mockClear()
    show.mockClear()
    onResized.mockClear()
    unlisten.mockClear()
    resizeHandler = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("restores window once and shows it", async () => {
    const onSave = vi.fn()
    const { rerender } = renderHook(() =>
      useWindowState({
        config: { width: 1200, height: 800 },
        onSave,
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(setSize).toHaveBeenCalledTimes(1)
    expect(center).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)

    rerender()

    expect(setSize).toHaveBeenCalledTimes(1)
  })

  it("debounces save on resize events", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useWindowState({
        config: { width: 800, height: 600 },
        onSave,
      }),
    )

    expect(onResized).toHaveBeenCalledTimes(1)
    resizeHandler?.()
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1)
    expect(onSave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("cleans up resize listener on unmount", async () => {
    const onSave = vi.fn()

    const { unmount } = renderHook(() =>
      useWindowState({
        config: { width: 800, height: 600 },
        onSave,
      }),
    )

    await act(async () => {
      unmount()
      await Promise.resolve()
    })

    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
