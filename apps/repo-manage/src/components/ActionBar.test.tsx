import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionBar } from "./ActionBar";

describe("ActionBar", () => {
  it("renders children", () => {
    render(
      <ActionBar>
        <button>Test Button</button>
      </ActionBar>
    );

    expect(screen.getByRole("button", { name: "Test Button" })).toBeInTheDocument();
  });

  it("renders right content when provided", () => {
    render(
      <ActionBar right={<span data-testid="right-content">Right</span>}>
        <button>Main</button>
      </ActionBar>
    );

    expect(screen.getByTestId("right-content")).toBeInTheDocument();
  });

  it("does not render right section when not provided", () => {
    render(
      <ActionBar>
        <button>Only Button</button>
      </ActionBar>
    );

    expect(screen.queryByTestId("right-content")).not.toBeInTheDocument();
  });
});
