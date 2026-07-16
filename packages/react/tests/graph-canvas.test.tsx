import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { GraphIndex, SceneState } from "@diascope/core";
import { WasmD2Compiler, SvgGraphBinding } from "@diascope/d2";
import { GraphCanvas, fitCameraToState } from "../src/GraphCanvas.js";

const SRC = `
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
`;

const EDGE_ID = "(request -> sys.api)[0]";
const ALL_NODES = ["sys", "sys.api", "request"];

describe("GraphCanvas", () => {
  let svg: string;
  let index: GraphIndex;

  beforeAll(async () => {
    // See packages/d2/tests/binding.test.ts for why `window` must be hidden during compile
    // under jsdom (the @terrastruct/d2 worker bootstrap misdetects browser vs. node).
    const savedWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      const result = await new WasmD2Compiler().compile(SRC);
      svg = result.svg;
      index = result.index;
    } finally {
      (globalThis as { window?: unknown }).window = savedWindow;
    }
  }, 30_000);

  afterEach(() => {
    cleanup();
  });

  const stateA: SceneState = {
    visible: ["request", "sys"],
    highlighted: ["request"],
    dimmed: [],
    traced: [],
    popovers: [],
    cameraFit: ALL_NODES,
  };

  const stateB: SceneState = {
    visible: ["request", "sys", "sys.api"],
    highlighted: ["sys.api"],
    dimmed: [],
    traced: [],
    popovers: [],
    cameraFit: ALL_NODES,
  };

  function classesOf(binding: SvgGraphBinding, id: string): string[] {
    const el = (id === EDGE_ID ? binding.edgeElement(id) : binding.nodeElement(id))!;
    return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }

  it("hosts the compiled svg inline, applies the scene state, and normalizes svg sizing", () => {
    const { container } = render(<GraphCanvas svg={svg} index={index} state={stateA} />);

    const host = container.querySelector('[data-diascope-part="canvas"]');
    expect(host).not.toBeNull();

    const svgEl = host!.querySelector("svg");
    expect(svgEl).not.toBeNull();

    const binding = new SvgGraphBinding(svgEl!, index);
    expect(classesOf(binding, "request")).toContain("ds-highlight");
    expect(classesOf(binding, "sys.api")).toContain("ds-hidden");

    expect(svgEl!.hasAttribute("width")).toBe(false);
    expect(svgEl!.hasAttribute("height")).toBe(false);
    expect((svgEl as unknown as SVGSVGElement).style.width).toBe("100%");
    expect((svgEl as unknown as SVGSVGElement).style.height).toBe("100%");
  });

  it("re-applies classes when the scene state changes", () => {
    const { container, rerender } = render(<GraphCanvas svg={svg} index={index} state={stateA} />);
    const svgEl = container.querySelector("svg")!;
    const binding = new SvgGraphBinding(svgEl, index);

    expect(classesOf(binding, "request")).toContain("ds-highlight");
    expect(classesOf(binding, "sys.api")).toContain("ds-hidden");

    rerender(<GraphCanvas svg={svg} index={index} state={stateB} />);

    expect(classesOf(binding, "request")).not.toContain("ds-highlight");
    expect(classesOf(binding, "sys.api")).toContain("ds-highlight");
  });

  it("calls onNodeClick with the node id when a node's descendant is clicked", () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <GraphCanvas svg={svg} index={index} state={stateB} onNodeClick={onNodeClick} />
    );
    const svgEl = container.querySelector("svg")!;
    const binding = new SvgGraphBinding(svgEl, index);
    const requestEl = binding.nodeElement("request")!;
    const child = requestEl.querySelector("text") ?? requestEl.querySelector("path") ?? requestEl.firstElementChild!;

    fireEvent.click(child);

    expect(onNodeClick).toHaveBeenCalledWith("request");
  });

  it("calls onEdgeHover with the edge id on hover, and with null over the empty canvas background", () => {
    const onEdgeHover = vi.fn();
    const { container } = render(
      <GraphCanvas svg={svg} index={index} state={stateB} onEdgeHover={onEdgeHover} />
    );
    const svgEl = container.querySelector("svg")!;
    const binding = new SvgGraphBinding(svgEl, index);
    const edgeEl = binding.edgeElement(EDGE_ID)!;
    const child = edgeEl.querySelector("path") ?? edgeEl.firstElementChild!;

    fireEvent.mouseMove(child);
    expect(onEdgeHover).toHaveBeenCalledWith(EDGE_ID, expect.anything());

    const host = container.querySelector('[data-diascope-part="canvas"]')!;
    fireEvent.mouseMove(host);
    expect(onEdgeHover).toHaveBeenLastCalledWith(null, expect.anything());
  });

  it("sets a non-empty camera viewBox on the hosted svg after mount", async () => {
    const { container } = render(<GraphCanvas svg={svg} index={index} state={stateA} />);
    const svgEl = container.querySelector("svg")!;

    await waitFor(() => {
      expect(svgEl.getAttribute("viewBox")).toBeTruthy();
    });
  });

  it("exposes fitCameraToState (shared by the state effect and resize re-fit), which fits the viewBox", async () => {
    const host = document.createElement("div");
    const svgDoc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgEl = svgDoc.documentElement as unknown as SVGSVGElement;
    svgEl.removeAttribute("viewBox");
    const binding = new SvgGraphBinding(svgEl, index);

    expect(typeof fitCameraToState).toBe("function");
    const cancel = fitCameraToState(binding, svgEl, host, stateA);
    expect(typeof cancel).toBe("function");
    await waitFor(() => {
      expect(svgEl.getAttribute("viewBox")).toBeTruthy();
    });
    cancel?.();

    // No geometry for the fit ids -> no animation to run, and it signals that with null.
    const none = fitCameraToState(binding, svgEl, host, { ...stateA, cameraFit: [] });
    expect(none).toBeNull();
  });

  it("renders a traced edge without throwing even though jsdom lacks getTotalLength/animate", () => {
    const edge = index.edges.find((e) => e.id === EDGE_ID)!;
    const traced: SceneState = { ...stateB, traced: [edge] };

    const { container } = render(<GraphCanvas svg={svg} index={index} state={traced} />);

    const svgEl = container.querySelector("svg")!;
    const binding = new SvgGraphBinding(svgEl, index);
    expect(classesOf(binding, EDGE_ID)).toContain("ds-trace");
  });
});
