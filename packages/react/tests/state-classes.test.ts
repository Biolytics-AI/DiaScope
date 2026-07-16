import { describe, it, expect, beforeAll } from "vitest";
import type { GraphIndex, SceneState } from "@diascope/core";
import { WasmD2Compiler, SvgGraphBinding } from "@diascope/d2";
import { applyStateToSvg } from "../src/state-classes.js";

const SRC = `
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
`;

const EDGE_ID = "(request -> sys.api)[0]";

describe("applyStateToSvg", () => {
  let index: GraphIndex;
  let binding: SvgGraphBinding;

  beforeAll(async () => {
    // See packages/d2/tests/binding.test.ts for why `window` must be hidden during compile
    // under jsdom (the @terrastruct/d2 worker bootstrap misdetects browser vs. node).
    const savedWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    let result: { svg: string; index: GraphIndex };
    try {
      result = await new WasmD2Compiler().compile(SRC);
    } finally {
      (globalThis as { window?: unknown }).window = savedWindow;
    }
    index = result.index;
    const svgDoc = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    binding = new SvgGraphBinding(svgDoc.documentElement, index);
  }, 30_000);

  const edge = () => index.edges.find((e) => e.id === EDGE_ID)!;

  function classesOf(id: string): string[] {
    const el = (id === EDGE_ID ? binding.edgeElement(id) : binding.nodeElement(id))!;
    return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }

  it("hides invisible nodes, highlights, dims, and hides an edge whose endpoint is hidden", () => {
    const state: SceneState = {
      visible: ["request", "sys"],
      highlighted: ["request"],
      dimmed: ["sys"],
      traced: [edge()],
      popovers: [],
      cameraFit: ["request"],
    };
    applyStateToSvg(binding, index, state);

    expect(classesOf("sys.api")).toContain("ds-hidden");

    const requestEl = binding.nodeElement("request")!;
    expect(classesOf("request")).toContain("ds-highlight");
    expect(requestEl.getAttribute("data-diascope-part")).toBe("node-highlight");
    expect(requestEl.getAttribute("data-diascope-id")).toBe("request");

    expect(classesOf("sys")).toContain("ds-dim");

    // sys.api (the edge's target) is hidden, so the edge is hidden too even though traced.
    expect(classesOf(EDGE_ID)).toContain("ds-hidden");
    expect(classesOf(EDGE_ID)).not.toContain("ds-trace");
  });

  it("removes stale classes and attributes when a different state is applied", () => {
    const state: SceneState = {
      visible: ["request", "sys", "sys.api"],
      highlighted: [],
      dimmed: [],
      traced: [],
      popovers: [],
      cameraFit: [],
    };
    applyStateToSvg(binding, index, state);

    const requestEl = binding.nodeElement("request")!;
    expect(classesOf("request")).not.toContain("ds-highlight");
    expect(requestEl.getAttribute("data-diascope-part")).toBeNull();
    expect(requestEl.getAttribute("data-diascope-id")).toBeNull();
    expect(classesOf("sys.api")).not.toContain("ds-hidden");
  });

  it("marks an edge ds-trace when both endpoints are visible and it is traced", () => {
    const state: SceneState = {
      visible: ["request", "sys", "sys.api"],
      highlighted: [],
      dimmed: [],
      traced: [edge()],
      popovers: [],
      cameraFit: [],
    };
    applyStateToSvg(binding, index, state);

    expect(classesOf(EDGE_ID)).toContain("ds-trace");
    expect(classesOf(EDGE_ID)).not.toContain("ds-hidden");
    expect(classesOf(EDGE_ID)).not.toContain("ds-dim");
  });

  it("marks an edge ds-dim when an endpoint is dimmed and it is not traced", () => {
    const state: SceneState = {
      visible: ["request", "sys", "sys.api"],
      highlighted: [],
      dimmed: ["sys.api"],
      traced: [],
      popovers: [],
      cameraFit: [],
    };
    applyStateToSvg(binding, index, state);

    expect(classesOf(EDGE_ID)).toContain("ds-dim");
    expect(classesOf(EDGE_ID)).not.toContain("ds-hidden");
    expect(classesOf(EDGE_ID)).not.toContain("ds-trace");
  });
});
