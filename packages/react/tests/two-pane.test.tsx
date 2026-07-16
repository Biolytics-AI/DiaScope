import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, fireEvent, renderHook, waitFor, cleanup, act } from "@testing-library/react";
import type { GraphIndex, NarrativeDocument } from "@diascope/core";
import { WasmD2Compiler, type D2Compiler } from "@diascope/d2";
import { TwoPaneScene } from "../src/TwoPaneScene.js";
import { useNarrative } from "../src/useNarrative.js";
import "../src/debug.js";

// Same D2 source Task 8 used elsewhere in this package (see state-classes.test.ts /
// graph-canvas.test.tsx): sys.api / request nodes with a single "query" edge between them.
const SRC = `
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
`;

const doc: NarrativeDocument = {
  version: 1,
  graph: { source: SRC },
  scenes: [
    {
      id: "main",
      layout: "two-pane",
      text: { title: "Scene Title" },
      annotations: {
        nodes: { "sys.api": "<p>API detail</p>" },
        edges: { query: "edge tip" },
      },
      steps: [
        { text: { title: "All systems" }, camera: { fit: "all" } },
        {
          text: { title: "Request focus" },
          focus: ["request"],
          popover: { target: "request", content: "Request enters" },
        },
      ],
    },
  ],
};

describe("TwoPaneScene / useNarrative / debug layout", () => {
  let svg: string;
  let index: GraphIndex;

  // The drawer's focus management (move focus to the close button on open, restore on close)
  // makes react-dom's focus plugin schedule deferred work. Left pending, that macrotask runs
  // during the later useNarrative test's D2 compile, which temporarily deletes globalThis.window
  // (see that test), tripping a ReferenceError inside react-dom. Draining a macrotask tick after
  // each teardown lets those focus side effects settle here, while window is still present.
  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

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

  function findNodeDescendant(container: HTMLElement, part: "canvas"): HTMLElement {
    const host = container.querySelector(`[data-diascope-part="${part}"]`)!;
    return host as HTMLElement;
  }

  // Locate a clickable descendant of the sys.api node's group by decoding the SVG's
  // base64 class tokens the same way SvgGraphBinding does, then walking to a leaf child
  // (GraphCanvas's click handler walks ancestors, so any descendant works).
  function sysApiDescendant(container: HTMLElement): Element {
    const svgEl = container.querySelector("svg")!;
    for (const el of svgEl.querySelectorAll("[class]")) {
      const first = (el.getAttribute("class") ?? "").trim().split(/\s+/)[0];
      let decoded: string | null = null;
      try {
        decoded = atob(first).replaceAll("-&gt;", "->").replaceAll("&lt;-", "<-");
      } catch {
        decoded = null;
      }
      if (decoded === "sys.api") {
        return el.querySelector("text") ?? el.querySelector("path") ?? el.firstElementChild ?? el;
      }
    }
    throw new Error("sys.api element not found in compiled svg");
  }

  // Finds the exact bound SVG element for a given node id (the same element
  // SvgGraphBinding.nodeElement/applyStateToSvg operate on), independent of whether it is
  // currently highlighted. data-diascope-id is only stamped on a node once it's highlighted
  // (see state-classes.ts), so a pre-click lookup for a not-yet-highlighted container/leaf
  // must decode the base64 class token directly rather than querying that attribute.
  function nodeGroupById(container: HTMLElement, id: string): Element {
    const svgEl = container.querySelector("svg")!;
    for (const el of svgEl.querySelectorAll("[class]")) {
      const first = (el.getAttribute("class") ?? "").trim().split(/\s+/)[0];
      let decoded: string | null = null;
      try {
        decoded = atob(first).replaceAll("-&gt;", "->").replaceAll("&lt;-", "<-");
      } catch {
        decoded = null;
      }
      if (decoded === id) return el;
    }
    throw new Error(`${id} element not found in compiled svg`);
  }

  it("renders scene/canvas/pane/pill-row parts; pane shows step 0's title; two pills; pill 0 current", () => {
    const onGoto = vi.fn();
    const { container } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );

    expect(container.querySelector('[data-diascope-part="scene"]')).not.toBeNull();
    expect(findNodeDescendant(container, "canvas")).not.toBeNull();
    const pane = container.querySelector('[data-diascope-part="pane"]');
    expect(pane).not.toBeNull();
    const pillRow = container.querySelector('[data-diascope-part="pill-row"]');
    expect(pillRow).not.toBeNull();

    expect(pane!.textContent).toContain("All systems");

    const pills = pillRow!.querySelectorAll("button");
    expect(pills.length).toBe(2);
    expect(pills[0].getAttribute("aria-current")).toBe("step");
    expect(pills[1].getAttribute("aria-current")).toBeNull();
  });

  it("shows a popover with target and content at step index 1", () => {
    const onGoto = vi.fn();
    const { container } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={1} onGoto={onGoto} />
    );

    const popover = container.querySelector('[data-diascope-part="popover"]');
    expect(popover).not.toBeNull();
    expect(popover!.getAttribute("data-diascope-target")).toBe("request");
    expect(popover!.textContent).toContain("Request enters");
  });

  it("pill click calls onGoto with the clicked step index", () => {
    const onGoto = vi.fn();
    const { container } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );
    const pills = container.querySelectorAll('[data-diascope-part="pill-row"] button');
    fireEvent.click(pills[1]);
    expect(onGoto).toHaveBeenCalledWith(1);
  });

  it("next/prev buttons call onGoto and disable at bounds", () => {
    const onGotoAtStart = vi.fn();
    const first = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGotoAtStart} />
    );
    const prevAtStart = first.getByLabelText("Previous step") as HTMLButtonElement;
    const nextAtStart = first.getByLabelText("Next step") as HTMLButtonElement;
    expect(prevAtStart.disabled).toBe(true);
    expect(nextAtStart.disabled).toBe(false);
    fireEvent.click(nextAtStart);
    expect(onGotoAtStart).toHaveBeenCalledWith(1);
    first.unmount();

    const onGotoAtEnd = vi.fn();
    const last = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={1} onGoto={onGotoAtEnd} />
    );
    const prevAtEnd = last.getByLabelText("Previous step") as HTMLButtonElement;
    const nextAtEnd = last.getByLabelText("Next step") as HTMLButtonElement;
    expect(nextAtEnd.disabled).toBe(true);
    expect(prevAtEnd.disabled).toBe(false);
    fireEvent.click(prevAtEnd);
    expect(onGotoAtEnd).toHaveBeenCalledWith(0);
  });

  it("opens a drawer with node annotation content on node click, and closes it", () => {
    const onGoto = vi.fn();
    const { container, queryByText, getByLabelText } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );

    expect(container.querySelector('[data-diascope-part="drawer"]')).toBeNull();

    const target = sysApiDescendant(container);
    fireEvent.click(target);

    const drawer = container.querySelector('[data-diascope-part="drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer!.textContent).toContain("API detail");
    // Opening the dialog moves focus to its close button (M-15 focus management).
    expect(document.activeElement).toBe(getByLabelText("Close details"));

    fireEvent.click(getByLabelText("Close details"));
    expect(container.querySelector('[data-diascope-part="drawer"]')).toBeNull();
    expect(queryByText("API detail")).toBeNull();
  });

  it("renders an error UI instead of throwing for an unknown sceneId", () => {
    const onGoto = vi.fn();
    const { container } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="nope" stepIndex={0} onGoto={onGoto} />
    );

    const err = container.querySelector('[data-diascope-part="scene-error"]');
    expect(err).not.toBeNull();
    expect(err!.textContent).toContain('Unknown scene "nope"');
    // None of the normal scene chrome renders in the error state.
    expect(container.querySelector('[data-diascope-part="pane"]')).toBeNull();
    expect(container.querySelector('[data-diascope-part="canvas"]')).toBeNull();
  });

  it("window.__diascopeDebug.layout() reports scene/canvas/pane/pill-row and a popover entry at step 1", () => {
    const onGoto = vi.fn();
    render(<TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={1} onGoto={onGoto} />);

    expect(window.__diascopeDebug).toBeDefined();
    const entries = window.__diascopeDebug!.layout();

    const parts = entries.map(e => e.part);
    for (const expected of ["scene", "canvas", "pane", "pill-row"]) {
      expect(parts).toContain(expected);
    }

    const popoverEntry = entries.find(e => e.part === "popover");
    expect(popoverEntry).toBeDefined();
    expect(popoverEntry!.target).toBe("request");

    for (const entry of entries) {
      expect(entry).toHaveProperty("part");
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("target");
      expect(entry.rect).toEqual(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        })
      );
    }
  });

  // The layout decision (see src/layout.ts) is derived purely from index geometry, not from
  // the svg itself, so these use hand-built indexes with deterministic union-bounds aspect
  // ratios (well above/below WIDE_ASPECT_THRESHOLD = 2.2) rather than depending on the real
  // compiled SRC diagram's incidental aspect. They reuse the real compiled `svg` from
  // beforeAll (a real svg is required to render), plus a minimal doc whose single step uses
  // `camera: { fit: "all" }` and no annotations — resolveStep only consults `index` for its
  // node-id list in that case (never geometry), so a real svg + a fabricated, mismatched
  // index is safe: SvgGraphBinding just finds no matching elements and binds/fits nothing,
  // with no throw (see packages/d2/src/binding.ts). This keeps the assertion deterministic
  // and independent of exactly what the SRC diagram happens to compile to.
  function geomIndex(geoms: [number, number, number, number][]): GraphIndex {
    return {
      nodes: geoms.map((g, i) => ({
        id: `n${i}`,
        label: `n${i}`,
        classes: [],
        parent: null,
        geometry: { x: g[0], y: g[1], width: g[2], height: g[3] },
      })),
      edges: [],
    };
  }

  const layoutDoc: NarrativeDocument = {
    version: 1,
    graph: { source: SRC },
    scenes: [
      {
        id: "main",
        layout: "two-pane",
        text: { title: "Scene Title" },
        steps: [{ text: { title: "Step" }, camera: { fit: "all" } }],
      },
    ],
  };

  it('sets data-diascope-layout="stacked" on the scene root for a wide diagram (union aspect > threshold)', () => {
    // union bounds: x 0..800, y 0..100 => 8:1, well above WIDE_ASPECT_THRESHOLD (2.2).
    const wideIndex = geomIndex([
      [0, 0, 100, 100],
      [700, 0, 100, 100],
    ]);
    const { container } = render(
      <TwoPaneScene svg={svg} index={wideIndex} doc={layoutDoc} sceneId="main" stepIndex={0} onGoto={vi.fn()} />
    );
    const scene = container.querySelector('[data-diascope-part="scene"]');
    expect(scene!.getAttribute("data-diascope-layout")).toBe("stacked");
  });

  it('sets data-diascope-layout="side-by-side" on the scene root for a tall diagram (union aspect <= threshold)', () => {
    // union bounds: x 0..100, y 0..400 => 0.25:1, well below WIDE_ASPECT_THRESHOLD (2.2).
    const tallIndex = geomIndex([[0, 0, 100, 400]]);
    const { container } = render(
      <TwoPaneScene svg={svg} index={tallIndex} doc={layoutDoc} sceneId="main" stepIndex={0} onGoto={vi.fn()} />
    );
    const scene = container.querySelector('[data-diascope-part="scene"]');
    expect(scene!.getAttribute("data-diascope-layout")).toBe("side-by-side");
  });

  // Task 2 wires explore state/click-routing into TwoPaneScene but adds no toggle UI yet (that's
  // Task 3), so explore mode can't be driven on from outside the component here. These tests
  // instead prove the plumbing (new hooks/state/renderedState/interactiveNodeIds branch) doesn't
  // regress the pre-existing, non-exploring render and interaction paths.
  it("leaf click while not exploring still opens the drawer for an annotated node (regression)", () => {
    const onGoto = vi.fn();
    const { container, getByLabelText } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );

    expect(container.querySelector('[data-diascope-part="drawer"]')).toBeNull();
    fireEvent.click(sysApiDescendant(container));

    const drawer = container.querySelector('[data-diascope-part="drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer!.textContent).toContain("API detail");
    expect(document.activeElement).toBe(getByLabelText("Close details"));
  });

  it("renders without throwing at step 0 and step 1 with explore state wired in (smoke)", () => {
    const onGoto = vi.fn();
    const first = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );
    expect(first.container.querySelector('[data-diascope-part="scene"]')).not.toBeNull();
    first.unmount();

    const second = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={1} onGoto={onGoto} />
    );
    expect(second.container.querySelector('[data-diascope-part="scene"]')).not.toBeNull();
    // Not exploring, so the authored popover for step 1 still renders (renderedState is the
    // identity of the authored state when exploreState.active is false).
    expect(second.container.querySelector('[data-diascope-part="popover"]')).not.toBeNull();
  });

  // Task 3 adds the actual toggle button + drill breadcrumb UI that Task 2's exploreState/
  // setExploreState plumbing was waiting to be driven by.
  it("the explore toggle enters explore mode, closes any open drawer, and can be toggled off again", () => {
    const onGoto = vi.fn();
    const { container, getByRole } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );

    // Open the drawer first.
    fireEvent.click(sysApiDescendant(container));
    expect(container.querySelector('[data-diascope-part="drawer"]')).not.toBeNull();

    const toggle = getByRole("button", { name: /explore/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    // Entering explore mode closes the drawer that was left open (Task 2 review note).
    expect(container.querySelector('[data-diascope-part="drawer"]')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("leaf click while exploring isolates instead of opening the drawer, even for an annotated node", () => {
    const onGoto = vi.fn();
    const { container, getByRole } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );
    fireEvent.click(getByRole("button", { name: /explore/i }));
    // sysApiDescendant locates the bound element by decoding the svg class token directly, so
    // it works whether or not "sys.api" is currently highlighted (unlike a data-diascope-id
    // query, which is only stamped once a node becomes highlighted — see nodeGroupById above).
    fireEvent.click(sysApiDescendant(container));
    expect(container.querySelector('[data-diascope-part="drawer"]')).toBeNull();
    const sysApiEl = container.querySelector('[data-diascope-id="sys.api"]');
    expect(sysApiEl).not.toBeNull();
    expect(sysApiEl!.getAttribute("class")).toContain("ds-highlight");
  });

  it("clicking a container while exploring drills into it and shows a breadcrumb", () => {
    const onGoto = vi.fn();
    const { container, getByRole } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );
    fireEvent.click(getByRole("button", { name: /explore/i }));
    fireEvent.click(nodeGroupById(container, "sys"));
    const breadcrumb = container.querySelector('[data-diascope-part="drill-breadcrumb"]');
    expect(breadcrumb).toBeTruthy();
    // "sys"'s label ("System", per the compiled D2 source) renders as the crumb text.
    expect(breadcrumb!.textContent).toContain("System");
  });

  it("clicking the drilled container's own breadcrumb crumb re-targets to it", () => {
    const onGoto = vi.fn();
    const { container, getByRole } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );
    fireEvent.click(getByRole("button", { name: /explore/i }));
    fireEvent.click(nodeGroupById(container, "sys"));
    const crumb = container.querySelector('[data-diascope-part="drill-breadcrumb"] button')!;
    fireEvent.click(crumb);
    expect(container.querySelector('[data-diascope-id="sys"]')?.getAttribute("class")).toContain("ds-highlight");
  });

  it("a stepIndex change while exploring auto-exits explore mode", () => {
    const onGoto = vi.fn();
    const { getByRole, rerender } = render(
      <TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={onGoto} />
    );
    // Grab the toggle once and reuse the same node across the rerender (React preserves its
    // identity at that position in the tree) rather than re-querying by accessible name: once
    // active the label reads "Exploring · Exit", which doesn't match /explore/i as a substring.
    const toggle = getByRole("button", { name: /explore/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    rerender(<TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={1} onGoto={onGoto} />);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("useNarrative", () => {
  afterEach(() => {
    cleanup();
  });

  function fakeCompiler(result: { svg: string; index: GraphIndex }): D2Compiler {
    return { compile: () => Promise.resolve(result) };
  }

  function rejectingCompiler(err: Error): D2Compiler {
    return { compile: () => Promise.reject(err) };
  }

  it("becomes ready with svg + index, and keeps stable identities across rerenders", async () => {
    let svg = "";
    let index: GraphIndex = { nodes: [], edges: [] };
    const savedWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      const result = await new WasmD2Compiler().compile(SRC);
      svg = result.svg;
      index = result.index;
    } finally {
      (globalThis as { window?: unknown }).window = savedWindow;
    }

    const compiler = fakeCompiler({ svg, index });
    const source = "hook-source-valid";
    const { result, rerender } = renderHook(
      ({ src, c }: { src: string; c: D2Compiler }) => useNarrative(src, c),
      { initialProps: { src: source, c: compiler } }
    );

    expect(result.current.ready).toBe(false);

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.svg).toBe(svg);
    expect(result.current.index).toBe(index);
    expect(result.current.error).toBeNull();

    const svgRef = result.current.svg;
    const indexRef = result.current.index;

    rerender({ src: source, c: compiler });

    expect(result.current.svg).toBe(svgRef);
    expect(result.current.index).toBe(indexRef);
  }, 30_000);

  it("sets error when the compiler rejects", async () => {
    const err = new Error("invalid d2 source");
    const compiler = rejectingCompiler(err);
    const { result } = renderHook(() => useNarrative("hook-source-invalid", compiler));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.error?.message).toBe("invalid d2 source");
    expect(result.current.ready).toBe(false);
  });
});
