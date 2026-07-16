import type { SceneState } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";

export const TRACE_DURATION_MS = 600;
export const TRACE_STAGGER_MS = 350;

/**
 * Draws each traced edge's path(s) with a "drawing itself in" stroke animation, staggered
 * by TRACE_STAGGER_MS per edge in `state.traced` order. jsdom implements neither
 * SVGPathElement.getTotalLength nor Element.animate, so both are feature-detected per path
 * and skipped gracefully when unavailable (tests run headless with no visible animation).
 */
export function runTraceAnimations(binding: SvgGraphBinding, state: SceneState): void {
  state.traced.forEach((edge, i) => {
    const group = binding.edgeElement(edge.id);
    if (!group) return;
    for (const path of group.querySelectorAll("path")) {
      const p = path as SVGPathElement;
      if (typeof p.getTotalLength !== "function" || typeof p.animate !== "function") continue; // jsdom guard
      const len = p.getTotalLength();
      if (!len) continue;
      p.style.strokeDasharray = String(len);
      p.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: TRACE_DURATION_MS, delay: i * TRACE_STAGGER_MS, easing: "ease-in-out", fill: "both" }
      );
    }
  });
}

/**
 * Removes the stroke-dasharray left behind by a previous runTraceAnimations call. Callers
 * pass the PREVIOUS state's traced edges (before applying the new state) so that edges
 * which are no longer traced don't retain a stale dash pattern.
 */
export function clearTraceStyles(binding: SvgGraphBinding, state: SceneState): void {
  state.traced.forEach((edge) => {
    const group = binding.edgeElement(edge.id);
    if (!group) return;
    for (const path of group.querySelectorAll("path")) {
      (path as SVGPathElement).style.removeProperty("stroke-dasharray");
    }
  });
}
