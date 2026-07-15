import { describe, it, expect } from "vitest";
import { resolveStep } from "../src/resolve.js";
import type { NarrativeDocument } from "../src/schema.js";
import type { GraphIndex } from "../src/graph.js";

const index: GraphIndex = {
  nodes: ["a", "b", "c", "d"].map(id => ({ id, label: id, classes: id === "d" ? ["aux"] : ["main"], parent: null })),
  edges: [
    { id: "(a -> b)[0]", source: "a", target: "b" },
    { id: "(b -> c)[0]", source: "b", target: "c" },
  ],
};
const doc: NarrativeDocument = {
  version: 1, graph: { source: "g.d2" },
  scenes: [{
    id: "main", layout: "two-pane",
    steps: [
      { id: "s0", camera: { fit: "all" } },
      { id: "s1", focus: ["a", "b"], trace: "a->b", popover: { target: "b", content: "hi" } },
      { id: "s2", hide: ["d"], highlight: ["c"], camera: { fit: "selection" } },
    ],
  }],
};

describe("resolveStep", () => {
  it("step 0: everything visible, camera fits all, nothing dimmed", () => {
    const s = resolveStep(doc, "main", 0, index);
    expect(s.visible).toEqual(["a", "b", "c", "d"]);
    expect(s.dimmed).toEqual([]);
    expect(s.cameraFit).toEqual(["a", "b", "c", "d"]);
  });
  it("step 1: focus drives highlight, dim, camera, trace, popover", () => {
    const s = resolveStep(doc, "main", 1, index);
    expect(s.highlighted).toEqual(["a", "b"]);
    expect(s.dimmed.sort()).toEqual(["c", "d"]);
    expect(s.cameraFit).toEqual(["a", "b"]);
    expect(s.traced.map(e => e.id)).toEqual(["(a -> b)[0]"]);
    expect(s.popovers).toEqual([{ target: "b", content: "hi" }]);
  });
  it("step 2: hide folds cumulatively; highlight without focus dims nothing", () => {
    const s = resolveStep(doc, "main", 2, index);
    expect(s.visible).toEqual(["a", "b", "c"]);
    expect(s.highlighted).toEqual(["c"]);
    expect(s.dimmed).toEqual([]);
    expect(s.cameraFit).toEqual(["c"]);
  });
  it("is order-independent: same result regardless of traversal history", () => {
    const forward = [0, 1, 2].map(i => resolveStep(doc, "main", i, index));
    const backward = [2, 1, 0].map(i => resolveStep(doc, "main", i, index)).reverse();
    expect(forward).toEqual(backward);
  });
  it("steps[0].show starts visibility from empty", () => {
    const showDoc: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", show: ["a", "b"] },
        { id: "s1", show: ["c"] },
      ] }],
    };
    expect(resolveStep(showDoc, "m", 0, index).visible).toEqual(["a", "b"]);
    expect(resolveStep(showDoc, "m", 1, index).visible).toEqual(["a", "b", "c"]);
  });
  it("throws on unknown scene and out-of-range step", () => {
    expect(() => resolveStep(doc, "nope", 0, index)).toThrow(/Unknown scene/);
    expect(() => resolveStep(doc, "main", 3, index)).toThrow(/out of range/);
    expect(() => resolveStep(doc, "main", -1, index)).toThrow(/out of range/);
  });
  it("focus on a hidden node is ignored (restricted to visible)", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", hide: ["a"] },
        { id: "s1", focus: ["a", "b"] },
      ] }],
    };
    const s = resolveStep(d, "m", 1, index);
    expect(s.highlighted).toEqual(["b"]);
    expect(s.visible).toEqual(["b", "c", "d"]);
  });
  it("explicit dim never contradicts focus/highlight", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", focus: ["a"], dim: { class: "main" } },
      ] }],
    };
    const s = resolveStep(d, "m", 0, index);
    expect(s.highlighted).toEqual(["a"]);
    expect(s.dimmed).not.toContain("a");
    expect(s.dimmed).toEqual(["b", "c", "d"]);
  });
  it("explicit dim excludes highlighted nodes even without focus", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", highlight: ["b"], dim: { class: "main" } },
      ] }],
    };
    const s = resolveStep(d, "m", 0, index);
    expect(s.highlighted).toEqual(["b"]);
    expect(s.dimmed).toEqual(["a", "c"]);
  });
  it("drops popovers whose target is not visible", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", hide: ["b"], popover: { target: "b", content: "gone" } },
      ] }],
    };
    expect(resolveStep(d, "m", 0, index).popovers).toEqual([]);
  });
  it("returns copies of traced edges and popovers, not aliases into doc/index", () => {
    const s = resolveStep(doc, "main", 1, index);
    expect(s.traced[0]).toEqual(index.edges[0]);
    expect(s.traced[0]).not.toBe(index.edges[0]);
    expect(s.popovers[0]).toEqual(doc.scenes[0].steps[1].popover);
    expect(s.popovers[0]).not.toBe(doc.scenes[0].steps[1].popover);
  });
  it("returns a copy of the step's text, not an alias", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", text: { title: "T", body: "B" } },
      ] }],
    };
    const s = resolveStep(d, "m", 0, index);
    expect(s.text).toEqual({ title: "T", body: "B" });
    expect(s.text).not.toBe(d.scenes[0].steps[0].text);
  });
  it("camera fallback with no camera/focus/highlight fits all visible", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [{ id: "s0" }] }],
    };
    expect(resolveStep(d, "m", 0, index).cameraFit).toEqual(["a", "b", "c", "d"]);
  });
  it("focus resolving entirely to hidden nodes behaves as no-focus", () => {
    const d: NarrativeDocument = {
      version: 1, graph: { source: "g.d2" },
      scenes: [{ id: "m", layout: "two-pane", steps: [
        { id: "s0", hide: ["a"] },
        { id: "s1", focus: ["a"] },
      ] }],
    };
    const s = resolveStep(d, "m", 1, index);
    expect(s.highlighted).toEqual([]);
    expect(s.dimmed).toEqual([]);
    expect(s.cameraFit).toEqual(["b", "c", "d"]);
  });
});
