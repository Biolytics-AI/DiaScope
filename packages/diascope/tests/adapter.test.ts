import { describe, it, expect } from "vitest";
import { storyToViewerOptions } from "../src/story/adapter.js";
import type { StoryFile } from "../src/story/types.js";

describe("storyToViewerOptions", () => {
  it("maps steps to viewer steps", () => {
    const story: StoryFile = {
      steps: [
        { id: "s1", title: "Step 1", nodes: ["A", "B"], tag: "01", body: "hello" },
      ],
    };
    const opts = storyToViewerOptions(story);
    expect(opts.steps![0]).toMatchObject({ tag: "01", title: "Step 1", body: "hello", nodes: ["A", "B"] });
  });

  it("collects all unique nodeIds from all steps", () => {
    const story: StoryFile = {
      steps: [
        { id: "s1", title: "T1", nodes: ["A", "B"] },
        { id: "s2", title: "T2", nodes: ["B", "C"] },
      ],
    };
    const opts = storyToViewerOptions(story);
    expect(opts.nodeIds).toEqual(expect.arrayContaining(["A", "B", "C"]));
    expect(opts.nodeIds).toHaveLength(3);
  });

  it("handles steps with no nodes", () => {
    const story: StoryFile = {
      steps: [{ id: "s1", title: "T" }],
    };
    const opts = storyToViewerOptions(story);
    expect(opts.nodeIds).toHaveLength(0);
  });

  it("passes through detail_panels and edge_tooltips", () => {
    const story: StoryFile = {
      steps: [{ id: "s1", title: "T" }],
      detail_panels: { X: "<p>x</p>" },
      edge_tooltips: { "foo": "bar" },
    };
    const opts = storyToViewerOptions(story);
    expect(opts.detailPanels?.["X"]).toBe("<p>x</p>");
    expect(opts.edgeTooltips?.["foo"]).toBe("bar");
  });
});
