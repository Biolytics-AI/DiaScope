import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { GraphIndex, NarrativeDocument } from "@diascope/core";
import { WasmD2Compiler, type D2Compiler } from "@diascope/d2";

// Hoisted so the "@revealjs/react" mock factory below (itself hoisted above imports by
// vitest) can close over a stable fake RevealApi and inspect what NarrativeScene did with it.
const { fakeReveal, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const fakeReveal = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    getIndices: vi.fn(() => ({ h: 0, v: 0, f: -1 })),
    slide: vi.fn(),
  };
  return { fakeReveal, handlers };
});

function fire(event: string) {
  for (const h of handlers.get(event) ?? []) h();
}

vi.mock("@revealjs/react", () => ({
  useReveal: () => fakeReveal,
  // asChild passthrough: reveal.js normally clones the child and toggles its `visible`
  // class; tests below simulate that by mutating the child's classList directly.
  Fragment: ({ asChild, children }: { asChild?: boolean; children: unknown }) =>
    asChild ? children : children,
}));

// Imported AFTER vi.mock so NarrativeScene picks up the mocked "@revealjs/react".
const { NarrativeScene } = await import("../src/NarrativeScene.js");

// Same D2 source Task 8/13 use elsewhere (sys.api / request nodes, one "query" edge).
const SRC = `
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
`;

function makeDoc(): NarrativeDocument {
  return {
    version: 1,
    graph: { source: SRC },
    scenes: [
      {
        id: "main",
        layout: "two-pane",
        text: { title: "Scene Title" },
        steps: [
          { text: { title: "Step 0" }, camera: { fit: "all" } },
          { text: { title: "Step 1" }, focus: ["request"] },
          { text: { title: "Step 2" }, focus: ["sys"] },
        ],
      },
    ],
  };
}

describe("NarrativeScene", () => {
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
    fakeReveal.on.mockClear();
    fakeReveal.off.mockClear();
    fakeReveal.getIndices.mockClear();
    fakeReveal.slide.mockClear();
    handlers.clear();
  });

  function fakeCompiler(): D2Compiler {
    return { compile: () => Promise.resolve({ svg, index }) };
  }

  function pendingCompiler(): D2Compiler {
    return { compile: () => new Promise(() => {}) };
  }

  function rejectingCompiler(err: Error): D2Compiler {
    return { compile: () => Promise.reject(err) };
  }

  it("renders N-1 invisible, aria-hidden fragment markers for an N-step scene", async () => {
    const doc = makeDoc();
    const { container } = render(
      <NarrativeScene d2Source="ns-markers" doc={doc} sceneId="main" compiler={fakeCompiler()} />
    );

    const markers = container.querySelectorAll(".diascope-step-marker");
    expect(markers.length).toBe(2);
    expect(markers[0].getAttribute("data-diascope-step")).toBe("1");
    expect(markers[1].getAttribute("data-diascope-step")).toBe("2");
    for (const m of markers) {
      expect(m.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("subscribes to all four reveal events on mount and unsubscribes on unmount", async () => {
    const doc = makeDoc();
    const { unmount } = render(
      <NarrativeScene d2Source="ns-subscribe" doc={doc} sceneId="main" compiler={fakeCompiler()} />
    );

    const onEvents = fakeReveal.on.mock.calls.map(c => c[0]);
    expect(onEvents).toEqual(expect.arrayContaining(["fragmentshown", "fragmenthidden", "slidechanged", "ready"]));

    unmount();

    const offEvents = fakeReveal.off.mock.calls.map(c => c[0]);
    expect(offEvents).toEqual(expect.arrayContaining(["fragmentshown", "fragmenthidden", "slidechanged", "ready"]));
  });

  it("advances on fragmentshown and retreats on fragmenthidden by recomputing marker count", async () => {
    const doc = makeDoc();
    const { container, findByText } = render(
      <NarrativeScene d2Source="ns-progress" doc={doc} sceneId="main" compiler={fakeCompiler()} />
    );

    await findByText("Step 0");

    const markers = container.querySelectorAll(".diascope-step-marker");

    act(() => {
      markers[0].classList.add("visible");
      fire("fragmentshown");
    });
    await findByText("Step 1");

    act(() => {
      markers[0].classList.remove("visible");
      fire("fragmenthidden");
    });
    await findByText("Step 0");
  });

  it("clamps a marker-count overshoot instead of crashing the deck", async () => {
    const doc = makeDoc();
    const { container, findByText } = render(
      <NarrativeScene d2Source="ns-overshoot" doc={doc} sceneId="main" compiler={fakeCompiler()} />
    );

    await findByText("Step 0");

    const root = container.querySelector(".diascope-scene")!;
    // Inject an extra visible marker beyond what the 3-step scene's 2 real fragments could
    // ever produce, simulating reveal.js momentarily reporting more visible fragments than
    // the doc has steps for (e.g. doc changed out from under an in-progress deck).
    const extra = document.createElement("span");
    extra.className = "diascope-step-marker visible";
    root.appendChild(extra);
    for (const m of container.querySelectorAll(".diascope-step-marker")) m.classList.add("visible");

    expect(() => {
      act(() => {
        fire("fragmentshown");
      });
    }).not.toThrow();

    // 3 visible markers clamp to the last valid step (index 2), not a crash.
    await findByText("Step 2");
  });

  it("wires pill clicks through onGoto to reveal.slide with fragmentIndex = target - 1", async () => {
    const doc = makeDoc();
    const { container, findByText } = render(
      <NarrativeScene d2Source="ns-goto" doc={doc} sceneId="main" compiler={fakeCompiler()} />
    );

    await findByText("Step 0");

    const pills = container.querySelectorAll('[data-diascope-part="pill-row"] button');
    expect(pills.length).toBe(3);

    fireEvent.click(pills[0]);
    expect(fakeReveal.slide).toHaveBeenLastCalledWith(0, 0, -1);

    fireEvent.click(pills[1]);
    expect(fakeReveal.slide).toHaveBeenLastCalledWith(0, 0, 0);

    fireEvent.click(pills[2]);
    expect(fakeReveal.slide).toHaveBeenLastCalledWith(0, 0, 1);
  });

  it("shows a loading state while the compiler is pending", () => {
    const doc = makeDoc();
    const { getByText } = render(
      <NarrativeScene d2Source="ns-loading" doc={doc} sceneId="main" compiler={pendingCompiler()} />
    );

    expect(getByText(/Compiling diagram/)).toBeTruthy();
  });

  it("shows an error state when the compiler rejects", async () => {
    const doc = makeDoc();
    const err = new Error("bad d2 source");
    const { findByText } = render(
      <NarrativeScene d2Source="ns-error" doc={doc} sceneId="main" compiler={rejectingCompiler(err)} />
    );

    await findByText(/bad d2 source/);
  });
});
