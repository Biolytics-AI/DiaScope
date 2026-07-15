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
  it("parses a full document including deferred verbs", () => {
    expect(NarrativeDocumentSchema.parse(valid)).toBeTruthy();
  });
  it("rejects unknown step keys and bad versions", () => {
    expect(() => NarrativeDocumentSchema.parse({ ...valid, version: 2 })).toThrow();
    const bad = structuredClone(valid);
    (bad.scenes[0].steps[0] as any).zoom = true;
    expect(() => NarrativeDocumentSchema.parse(bad)).toThrow();
  });
  it("requires at least one scene and one step", () => {
    expect(() => NarrativeDocumentSchema.parse({ version: 1, graph: { source: "x" }, scenes: [] })).toThrow();
  });
});
