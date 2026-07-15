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
});
