import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useAppSettingsStore } from "../stores/appSettingsStore"
import { useAppSettings } from "./useAppSettings"

beforeEach(() => {
  // Reset store to initial state before each test
  useAppSettingsStore.getState().reset()
})

describe("useAppSettings", () => {
  it("returns theme from store", () => {
    useAppSettingsStore.setState({ theme: "dark" })
    const { result } = renderHook(() => useAppSettings())
    expect(result.current.theme).toBe("dark")
  })

  it("returns lmsConnection from store", () => {
    const connection = {
      lms_type: "canvas" as const,
      base_url: "https://canvas.example.com",
      access_token: "token",
    }
    useAppSettingsStore.setState({ lmsConnection: connection })
    const { result } = renderHook(() => useAppSettings())
    expect(result.current.lmsConnection).toEqual(connection)
  })

  it("returns gitConnections from store", () => {
    const connections = {
      "my-github": {
        server_type: "GitHub" as const,
        connection: {
          access_token: "token",
          base_url: null,
          user: "user",
        },
        identity_mode: null,
      },
    }
    useAppSettingsStore.setState({ gitConnections: connections })
    const { result } = renderHook(() => useAppSettings())
    expect(result.current.gitConnections).toEqual(connections)
  })

  it("returns status from store", () => {
    useAppSettingsStore.setState({ status: "loaded" })
    const { result } = renderHook(() => useAppSettings())
    expect(result.current.status).toBe("loaded")
  })

  it("returns error from store", () => {
    useAppSettingsStore.setState({ error: "Test error" })
    const { result } = renderHook(() => useAppSettings())
    expect(result.current.error).toBe("Test error")
  })

  it("provides save function", () => {
    const { result } = renderHook(() => useAppSettings())
    expect(typeof result.current.save).toBe("function")
  })

  it("provides load function", () => {
    const { result } = renderHook(() => useAppSettings())
    expect(typeof result.current.load).toBe("function")
  })
})
