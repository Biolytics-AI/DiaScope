import { describe, it, expect } from "vitest";
import { NarrativeDocumentSchema } from "../src/schema.js";

const valid = {
  version: 1,
  graph: { source: "./arch.d2" },
  scenes: [{
    id: "overview",
    steps: [
      { id: "s0", camera: { fit: "all" }, text: { title: "T", body: "B" } },
      { id: "s1", focus: ["a"], highlight: [{ class: "svc" }], dim: { not: { class: "svc" } },
        trace: "a->b->c", popover: { target: "b", content: "hi" } },
      { id: "s2", waitFor: "click", isolate: ["a"] }
    ],
    annotations: { nodes: { a: "<p>detail</p>" }, edges: { "a->b": "tip" } }
  }]
};

describe("NarrativeDocumentSchema", () => {
  it("parses a full document including deferred verbs and defaults layout", () => {
    // `valid` omits `layout` on the scene; parsing must default it to "two-pane"
    expect(NarrativeDocumentSchema.parse(valid)).toMatchObject({
      version: 1,
      scenes: [{ id: "overview", layout: "two-pane" }],
    });
  });
  it("parses nested recursive selectors", () => {
    const doc = structuredClone(valid);
    (doc.scenes[0].steps[1] as any).dim = { not: { not: { class: "svc" } } };
    expect(NarrativeDocumentSchema.parse(doc)).toBeTruthy();
  });
  it("parses popover and camera array forms", () => {
    const doc = structuredClone(valid);
    (doc.scenes[0].steps[1] as any).popover = [
      { target: "b", content: "hi" },
      { target: "c", content: "yo" },
    ];
    (doc.scenes[0].steps[0] as any).camera = { fit: ["a", { class: "x" }] };
    expect(NarrativeDocumentSchema.parse(doc)).toBeTruthy();
  });
  it("rejects unknown step keys and bad versions", () => {
    expect(() => NarrativeDocumentSchema.parse({ ...valid, version: 2 })).toThrow();
    const bad = structuredClone(valid);
    (bad.scenes[0].steps[0] as any).zoom = true;
    expect(() => NarrativeDocumentSchema.parse(bad)).toThrow();
  });
  it("requires at least one scene and one step", () => {
    expect(() => NarrativeDocumentSchema.parse({ version: 1, graph: { source: "x" }, scenes: [] })).toThrow();
    expect(() => NarrativeDocumentSchema.parse({
      version: 1, graph: { source: "x" }, scenes: [{ id: "s", steps: [] }],
    })).toThrow();
  });
});
