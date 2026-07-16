import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Scene } from "@diascope/core";
import { NarrativePane } from "../src/NarrativePane.js";

const scene: Scene = {
  id: "main",
  layout: "two-pane",
  text: { title: "Overview" },
  steps: [{ id: "s0", text: { title: "Step one" } }],
};

describe("NarrativePane", () => {
  it("renders no tab row when views is omitted (unchanged default behavior)", () => {
    const { container } = render(<NarrativePane scene={scene} stepIndex={0} onGoto={vi.fn()} />);
    expect(container.querySelector('[data-diascope-part="lens-tabs"]')).toBeNull();
  });

  it("renders no tab row when only one view exists (nothing to switch between)", () => {
    const { container } = render(
      <NarrativePane
        scene={scene}
        stepIndex={0}
        onGoto={vi.fn()}
        views={[{ id: "default", label: "Overview" }]}
        activeViewId="default"
        onLensChange={vi.fn()}
      />
    );
    expect(container.querySelector('[data-diascope-part="lens-tabs"]')).toBeNull();
  });

  it("renders a tab per view, marks the active one, and calls onLensChange on click", () => {
    const onLensChange = vi.fn();
    const { container, getByText } = render(
      <NarrativePane
        scene={scene}
        stepIndex={0}
        onGoto={vi.fn()}
        views={[{ id: "default", label: "Overview" }, { id: "legal", label: "Legal" }]}
        activeViewId="default"
        onLensChange={onLensChange}
      />
    );
    const tabs = container.querySelector('[data-diascope-part="lens-tabs"]');
    expect(tabs).not.toBeNull();
    const buttons = tabs!.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(getByText("Legal"));
    expect(onLensChange).toHaveBeenCalledWith("legal");
  });
});
