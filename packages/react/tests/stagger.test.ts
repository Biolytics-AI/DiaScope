import { describe, it, expect } from "vitest";
import type { GraphIndex, GraphNode, SceneState } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";
import { applyStateToSvg } from "../src/state-classes.js";

/**
 * The "flash" bug: when a step crosses from "nothing dimmed" to "many nodes dimmed", 40+
 * nodes all gain `.ds-dim` in the same tick and CSS-transition their opacity down together,
 * reading as a single jarring flash while the camera is independently panning. The fix
 * staggers the onset of each node's opacity transition via an inline `transition-delay`, so
 * the mass change settles as a brief wave instead of one simultaneous jump — capped so the
 * wave never lengthens total settle time past the camera's pan for large diagrams.
 *
 * These tests pin that timing contract directly on applyStateToSvg (the shared render path),
 * using a mock binding so we can exercise a large simultaneous dim without compiling a huge
 * diagram.
 */

// The contract the implementation must honour. Chosen so the last node's opacity transition
// (delay + the 400ms CSS opacity transition) still finishes before the 600ms camera pan.
const STAGGER_CAP_MS = 80;

const SVG_NS = "http://www.w3.org/2000/svg";

function buildIndex(nodeCount: number): { index: GraphIndex; els: Map<string, SVGGElement> } {
  const els = new Map<string, SVGGElement>();
  const nodes: GraphNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `n${i}`;
    nodes.push({ id, label: id, classes: [], parent: null });
    els.set(id, document.createElementNS(SVG_NS, "g") as SVGGElement);
  }
  return { index: { nodes, edges: [] }, els };
}

function mockBinding(els: Map<string, SVGGElement>): SvgGraphBinding {
  return {
    nodeElement: (id: string) => els.get(id) ?? null,
    edgeElement: () => null,
  } as unknown as SvgGraphBinding;
}

/** Parse a CSS <time> value ("40ms" / "0.04s") to milliseconds; "" -> 0. */
function ms(v: string): number {
  if (!v) return 0;
  if (v.endsWith("ms")) return parseFloat(v);
  if (v.endsWith("s")) return parseFloat(v) * 1000;
  return NaN;
}

function stateAllVisible(ids: string[], dimmed: string[], highlighted: string[] = []): SceneState {
  return { visible: ids, dimmed, highlighted, traced: [], popovers: [], cameraFit: [] };
}

describe("applyStateToSvg opacity-transition stagger (flash fix)", () => {
  it("gives every simultaneously-dimmed node a non-uniform, non-zero transition-delay", () => {
    const { index, els } = buildIndex(60);
    const ids = index.nodes.map((n) => n.id);
    // n0 highlighted, n1..n59 dimmed => 59 nodes gain .ds-dim in one call.
    const dimmed = ids.slice(1);
    applyStateToSvg(mockBinding(els), index, stateAllVisible(ids, dimmed, ["n0"]));

    const delays = dimmed.map((id) => ms(els.get(id)!.style.transitionDelay));

    // Present on every dimmed node.
    expect(delays.every((d) => Number.isFinite(d))).toBe(true);
    // Staggered: not all identical, and not uniformly zero (this is what fails pre-fix).
    expect(new Set(delays).size).toBeGreaterThan(1);
    expect(delays.some((d) => d > 0)).toBe(true);
    // A wave, not noise: non-decreasing in node order.
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
  });

  it("caps the stagger so a large diagram's settle time stays bounded", () => {
    const { index, els } = buildIndex(120);
    const ids = index.nodes.map((n) => n.id);
    const dimmed = ids.slice(1); // 119 dimmed nodes
    applyStateToSvg(mockBinding(els), index, stateAllVisible(ids, dimmed, ["n0"]));

    const delays = dimmed.map((id) => ms(els.get(id)!.style.transitionDelay));
    const max = Math.max(...delays);
    // Bounded by the cap, which itself must stay well under the 600ms camera pan even after
    // the 400ms opacity transition is added on top.
    expect(max).toBeLessThanOrEqual(STAGGER_CAP_MS);
    expect(STAGGER_CAP_MS + 400).toBeLessThanOrEqual(600);
    // With 119 dimmed nodes the cap must actually be reached (proving it doesn't scale linearly).
    expect(max).toBe(STAGGER_CAP_MS);
  });

  it("also staggers newly-hidden nodes (they fade out on the same shared transition)", () => {
    const { index, els } = buildIndex(60);
    const ids = index.nodes.map((n) => n.id);
    const visible = ids.slice(0, 10); // n10..n59 become hidden
    applyStateToSvg(mockBinding(els), index, {
      visible,
      dimmed: [],
      highlighted: [],
      traced: [],
      popovers: [],
      cameraFit: [],
    });
    const hidden = ids.slice(10);
    const delays = hidden.map((id) => ms(els.get(id)!.style.transitionDelay));
    expect(new Set(delays).size).toBeGreaterThan(1);
    expect(delays.some((d) => d > 0)).toBe(true);
  });

  it("clears a stale stagger delay when a node returns to full opacity", () => {
    const { index, els } = buildIndex(30);
    const ids = index.nodes.map((n) => n.id);
    // First: dim everything but n0, so mid/late nodes get a non-zero delay.
    applyStateToSvg(mockBinding(els), index, stateAllVisible(ids, ids.slice(1), ["n0"]));
    const someDimmed = "n20";
    expect(ms(els.get(someDimmed)!.style.transitionDelay)).toBeGreaterThan(0);

    // Then: nothing dimmed. The previously-dimmed node must not keep its stale delay,
    // or a later re-dim would fire with a wrong offset.
    applyStateToSvg(mockBinding(els), index, stateAllVisible(ids, [], []));
    expect(els.get(someDimmed)!.style.transitionDelay).toBe("");
  });
});
