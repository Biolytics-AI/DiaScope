import { describe, it, expect } from "vitest";
import type { GraphIndex, NarrativeDocument, Scene } from "../src/schema.js";
import { effectiveSteps, resolveStepInView } from "../src/views.js";

const index: GraphIndex = {
  nodes: [
    { id: "a", label: "A", classes: [], parent: null },
    { id: "b", label: "B", classes: [], parent: null },
  ],
  edges: [],
};

const sceneNoViews: Scene = {
  id: "main",
  layout: "two-pane",
  text: { title: "Overview" },
  steps: [{ id: "s0", camera: { fit: "all" } }, { id: "s1", focus: ["a"] }],
};

const sceneWithViews: Scene = {
  ...sceneNoViews,
  views: [
    { id: "legal", label: "Legal", steps: [{ id: "l0", focus: ["b"] }] },
    { id: "infra", label: "Infra", steps: [{ id: "i0", focus: ["a"] }, { id: "i1", focus: ["b"] }] },
  ],
};

describe("effectiveSteps", () => {
  it("a scene with no views produces a single implicit default view wrapping scene.steps", () => {
    const views = effectiveSteps(sceneNoViews);
    expect(views).toEqual([{ id: "default", label: "Overview", steps: sceneNoViews.steps }]);
  });

  it("a scene with views prepends the default view before the authored ones, in order", () => {
    const views = effectiveSteps(sceneWithViews);
    expect(views.map(v => v.id)).toEqual(["default", "legal", "infra"]);
    expect(views[0].steps).toBe(sceneWithViews.steps);
    expect(views[1]).toEqual({ id: "legal", label: "Legal", steps: sceneWithViews.views![0].steps });
  });

  it("the default view's label falls back to the scene title, defaulting to 'Overview' when the scene has no text", () => {
    const untitled: Scene = { id: "x", layout: "two-pane", steps: sceneNoViews.steps };
    expect(effectiveSteps(untitled)[0].label).toBe("Overview");
  });
});

describe("resolveStepInView", () => {
  const doc: NarrativeDocument = { version: 1, graph: { source: "g.d2" }, scenes: [sceneWithViews] };

  it("defaults to the 'default' view, matching plain resolveStep on scene.steps", () => {
    const s = resolveStepInView(doc, "main", "default", 1, index);
    expect(s.highlighted).toEqual(["a"]);
  });

  it("resolves against an authored view's own steps", () => {
    const s = resolveStepInView(doc, "main", "legal", 0, index);
    expect(s.highlighted).toEqual(["b"]);
  });

  it("an unknown view id falls back to the default view", () => {
    const s = resolveStepInView(doc, "main", "nope", 0, index);
    expect(s.highlighted).toEqual([]); // default view step 0 has no focus
  });

  it("clamps an out-of-range stepIndex to the chosen view's step count instead of throwing", () => {
    // "legal" has only 1 step; requesting step 5 must clamp to its last valid index (0), not throw.
    expect(() => resolveStepInView(doc, "main", "legal", 5, index)).not.toThrow();
    const s = resolveStepInView(doc, "main", "legal", 5, index);
    expect(s.highlighted).toEqual(["b"]);
  });

  it("clamps a negative stepIndex to 0", () => {
    const s = resolveStepInView(doc, "main", "infra", -3, index);
    expect(s.highlighted).toEqual(["a"]); // infra step 0
  });

  it("throws on an unknown scene id, matching resolveStep's own contract", () => {
    expect(() => resolveStepInView(doc, "nope", "default", 0, index)).toThrow(/Unknown scene/);
  });
});
