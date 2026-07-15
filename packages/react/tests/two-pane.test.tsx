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
