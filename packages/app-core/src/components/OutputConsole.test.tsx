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
    expect(
      screen.getByPlaceholderText("Output will appear here..."),
    ).toBeInTheDocument()
  })

  it("displays output text from store", () => {
    // Use new API - appendText adds structured lines
    useOutputStore.getState().appendText("Test output line")
    render(<OutputConsole />)
    expect(screen.getByDisplayValue(/Test output line/)).toBeInTheDocument()
  })

  it("displays multiple lines", () => {
    const store = useOutputStore.getState()
    // Use new API
    store.appendText("Line 1")
    store.appendText("Line 2")
    store.appendText("Line 3")

    render(<OutputConsole />)

    const textarea = screen.getByRole("textbox")
    // New store joins lines without trailing newline
    expect(textarea).toHaveValue("Line 1\nLine 2\nLine 3")
  })

  it("textarea is readonly", () => {
    render(<OutputConsole />)
    const textarea = screen.getByRole("textbox")
    expect(textarea).toHaveAttribute("readonly")
  })
})
