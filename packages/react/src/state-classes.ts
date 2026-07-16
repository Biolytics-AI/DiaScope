import type { GraphIndex, SceneState } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";

const NODE_CLASSES = ["ds-hidden", "ds-dim", "ds-highlight"];
const EDGE_CLASSES = ["ds-hidden", "ds-dim", "ds-trace"];

/**
 * Per-node onset ramp (ms) and cap (ms) for the opacity-transition stagger.
 *
 * Why this exists: a step that crosses from "nothing dimmed" to "many nodes dimmed" makes
 * 40+ nodes gain `.ds-dim`/`.ds-hidden` in the same tick, so their CSS opacity transitions
 * (styles.css: `transition: opacity 400ms ease`) all fire simultaneously. That synchronised,
 * high-magnitude change — happening while the camera is independently panning over 600ms
 * (camera.ts `animateViewBox`) — is what reads as a "flash". Spreading each node's onset by a
 * few ms turns the one big jump into a brief wave (the same idea trace.ts already uses for
 * trace-edge draw-ins via TRACE_STAGGER_MS), which no longer flashes.
 *
 * The cap keeps it bounded: the last node starts at most DIM_STAGGER_CAP_MS late, so even a
 * huge diagram's opacity settle (cap + the 400ms transition) still finishes before the 600ms
 * camera pan — the wave never lengthens the perceived settle time.
 */
export const DIM_STAGGER_MS = 2;
export const DIM_STAGGER_CAP_MS = 80;

/** Onset delay (as a CSS <time>) for the Nth node, in dim/hide order, to transition this frame. */
function staggerDelay(order: number): string {
  return `${Math.min(order * DIM_STAGGER_MS, DIM_STAGGER_CAP_MS)}ms`;
}

/**
 * Applies a resolved SceneState to a bound SVG as CSS classes (and, for highlighted
 * nodes, a small set of data-diascope-* attributes consumed by popover positioning in
 * later tasks). Idempotent and safe to call every step/frame: each call first strips the
 * classes/attributes it owns before re-deriving them from `state`, so switching states
 * never leaves stale markup behind.
 *
 * Precedence per element: hidden > highlight > dim (nodes), hidden > trace > dim (edges).
 * An edge is hidden whenever either endpoint is hidden, even if the edge is traced.
 */
export function applyStateToSvg(binding: SvgGraphBinding, index: GraphIndex, state: SceneState): void {
  const visible = new Set(state.visible);
  const dimmed = new Set(state.dimmed);
  const highlighted = new Set(state.highlighted);
  const tracedIds = new Set(state.traced.map((e) => e.id));

  // Counts nodes that begin an opacity transition this frame (dim/hide), so each gets a
  // slightly later onset than the last — see DIM_STAGGER_MS. Nodes that don't transition
  // (highlight/full) have their inline delay cleared so a stale offset never lingers.
  let staggerOrder = 0;
  for (const node of index.nodes) {
    const el = binding.nodeElement(node.id);
    if (!el) continue;
    el.classList.remove(...NODE_CLASSES);
    if (el.getAttribute("data-diascope-part") === "node-highlight") {
      el.removeAttribute("data-diascope-part");
      el.removeAttribute("data-diascope-id");
    }
    const style = (el as unknown as ElementCSSInlineStyle).style;
    if (!visible.has(node.id)) {
      el.classList.add("ds-hidden");
      style.transitionDelay = staggerDelay(staggerOrder++);
    } else if (highlighted.has(node.id)) {
      el.classList.add("ds-highlight");
      el.setAttribute("data-diascope-part", "node-highlight");
      el.setAttribute("data-diascope-id", node.id);
      style.transitionDelay = "";
    } else if (dimmed.has(node.id)) {
      el.classList.add("ds-dim");
      style.transitionDelay = staggerDelay(staggerOrder++);
    } else {
      style.transitionDelay = "";
    }
  }

  for (const edge of index.edges) {
    const el = binding.edgeElement(edge.id);
    if (!el) continue;
    el.classList.remove(...EDGE_CLASSES);
    if (!visible.has(edge.source) || !visible.has(edge.target)) {
      el.classList.add("ds-hidden");
    } else if (tracedIds.has(edge.id)) {
      el.classList.add("ds-trace");
    } else if (dimmed.has(edge.source) || dimmed.has(edge.target)) {
      el.classList.add("ds-dim");
    }
  }
}
