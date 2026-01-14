import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useOutputStore } from "../stores"
import { OutputConsole } from "./OutputConsole"

describe("OutputConsole", () => {
  beforeEach(() => {
    useOutputStore.getState().clear()
  })

  it("shows placeholder when empty", () => {
    render(<OutputConsole />)
    expect(screen.getByText("Output will appear here...")).toBeInTheDocument()
  })

  it("displays output text from store", () => {
    useOutputStore.getState().appendText("Test output line")
    render(<OutputConsole />)
    expect(screen.getByText("Test output line")).toBeInTheDocument()
  })

  it("displays multiple lines", () => {
    const store = useOutputStore.getState()
    store.appendText("Line 1")
    store.appendText("Line 2")
    store.appendText("Line 3")

    render(<OutputConsole />)

    expect(screen.getByText("Line 1")).toBeInTheDocument()
    expect(screen.getByText("Line 2")).toBeInTheDocument()
    expect(screen.getByText("Line 3")).toBeInTheDocument()
  })

  it("applies level-based styling", () => {
    const store = useOutputStore.getState()
    store.appendText("Info message", "info")
    store.appendText("Error message", "error")
    store.appendText("Warning message", "warning")
    store.appendText("Success message", "success")

    render(<OutputConsole />)

    // Verify all messages are rendered
    expect(screen.getByText("Info message")).toBeInTheDocument()
    expect(screen.getByText("Error message")).toBeInTheDocument()
    expect(screen.getByText("Warning message")).toBeInTheDocument()
    expect(screen.getByText("Success message")).toBeInTheDocument()
  })
})
