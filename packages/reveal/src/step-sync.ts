/**
 * Counts DOM markers reveal.js has toggled `visible` on. A narrative scene with N steps
 * renders N-1 invisible fragment marker spans (one per step after step 0); the current step
 * is simply the count of markers currently visible (0 markers visible == step 0). This makes
 * forward/backward navigation symmetric — both directions just recompute this count rather
 * than tracking a delta.
 */
export function countVisibleMarkers(root: Element | null): number {
  return root ? root.querySelectorAll(".diascope-step-marker.visible").length : 0;
}

/**
 * Clamps a computed step index into [0, stepCount - 1]. reveal.js's fragment count can
 * momentarily disagree with the narrative doc (e.g. the doc changes out from under an
 * in-progress deck, or a fragment overshoots), and resolveStep throws on an out-of-range
 * index — clamping here is what keeps a fragment-count overshoot from ever crashing the deck.
 */
export function clampStep(computed: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(computed, 0), stepCount - 1);
}
