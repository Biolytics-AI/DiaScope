import { describe, it, expect } from "vitest";
import { diagramAspect, isWideDiagram, WIDE_ASPECT_THRESHOLD } from "../src/layout.js";
import type { GraphIndex } from "@diascope/core";

const idx = (geoms: ([number,number,number,number] | null)[]): GraphIndex => ({
  nodes: geoms.map((g, i) => ({ id: `n${i}`, label: `n${i}`, classes: [], parent: null,
    geometry: g ? { x: g[0], y: g[1], width: g[2], height: g[3] } : undefined })),
  edges: [],
});

describe("diagramAspect", () => {
  it("computes union-bounds aspect (w/h)", () => {
    // union spans x:0..400 y:0..100 => 4:1
    expect(diagramAspect(idx([[0,0,100,100],[300,0,100,100]]))!).toBeCloseTo(4);
  });
  it("single node aspect", () => {
    expect(diagramAspect(idx([[10,10,200,50]]))!).toBeCloseTo(4);
  });
  it("ignores nodes without geometry, unions the rest", () => {
    expect(diagramAspect(idx([null,[0,0,200,100],null]))!).toBeCloseTo(2);
  });
  it("returns null when no node has geometry", () => {
    expect(diagramAspect(idx([null,null]))).toBeNull();
  });
});

describe("isWideDiagram", () => {
  it("true above threshold, false at/below", () => {
    expect(isWideDiagram(idx([[0,0,400,100]]))).toBe(true);   // 4:1 > 2.2
    expect(isWideDiagram(idx([[0,0,200,100]]))).toBe(false);  // 2:1 < 2.2
    expect(isWideDiagram(idx([[0,0,100,200]]))).toBe(false);  // 0.5:1 tall
  });
  it("respects a custom threshold", () => {
    expect(isWideDiagram(idx([[0,0,250,100]]), 3)).toBe(false); // 2.5 < 3
    expect(isWideDiagram(idx([[0,0,250,100]]), 2)).toBe(true);  // 2.5 > 2
  });
  it("false (side-by-side) when geometry missing", () => {
    expect(isWideDiagram(idx([null]))).toBe(false);
  });
  it("exposes the threshold constant", () => {
    expect(WIDE_ASPECT_THRESHOLD).toBe(2.2);
  });
});
