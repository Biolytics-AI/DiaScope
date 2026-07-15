import type { GraphIndex, SceneState } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";

const NODE_CLASSES = ["ds-hidden", "ds-dim", "ds-highlight"];
const EDGE_CLASSES = ["ds-hidden", "ds-dim", "ds-trace"];

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

  for (const node of index.nodes) {
    const el = binding.nodeElement(node.id);
    if (!el) continue;
    el.classList.remove(...NODE_CLASSES);
    if (el.getAttribute("data-diascope-part") === "node-highlight") {
      el.removeAttribute("data-diascope-part");
      el.removeAttribute("data-diascope-id");
    }
    if (!visible.has(node.id)) {
      el.classList.add("ds-hidden");
    } else if (highlighted.has(node.id)) {
      el.classList.add("ds-highlight");
      el.setAttribute("data-diascope-part", "node-highlight");
      el.setAttribute("data-diascope-id", node.id);
    } else if (dimmed.has(node.id)) {
      el.classList.add("ds-dim");
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
