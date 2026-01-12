import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ActionBar } from "./ActionBar"

describe("ActionBar", () => {
  it("renders children", () => {
    render(
      <ActionBar>
        <button type="button">Test Button</button>
      </ActionBar>,
    )

    expect(
      screen.getByRole("button", { name: "Test Button" }),
    ).toBeInTheDocument()
  })

  it("renders right content when provided", () => {
    render(
      <ActionBar right={<span data-testid="right-content">Right</span>}>
        <button type="button">Main</button>
      </ActionBar>,
    )

    expect(screen.getByTestId("right-content")).toBeInTheDocument()
  })

  it("does not render right section when not provided", () => {
    render(
      <ActionBar>
        <button type="button">Only Button</button>
      </ActionBar>,
    )

    expect(screen.queryByTestId("right-content")).not.toBeInTheDocument()
  })
})
