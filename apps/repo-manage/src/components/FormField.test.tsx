import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "./FormField";
import { TooltipProvider } from "@repo-edu/ui";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

describe("FormField", () => {
  it("renders label and children", () => {
    render(
      <FormField label="Test Label">
        <input data-testid="child-input" />
      </FormField>,
      { wrapper }
    );

    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByTestId("child-input")).toBeInTheDocument();
  });

  it("renders tooltip indicator when tooltip provided", () => {
    render(
      <FormField label="With Tooltip" tooltip="Help text">
        <input />
      </FormField>,
      { wrapper }
    );

    const label = screen.getByText("With Tooltip");
    expect(label).toHaveClass("border-dashed");
  });

  it("renders plain label without tooltip", () => {
    render(
      <FormField label="Plain Label">
        <input />
      </FormField>,
      { wrapper }
    );

    const label = screen.getByText("Plain Label");
    expect(label).not.toHaveClass("border-dashed");
  });
});
