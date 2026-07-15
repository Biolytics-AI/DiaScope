import type { GraphIndex } from "@diascope/core";

/** Diagrams wider than this aspect (w/h) letterbox badly in the ~1.3:1 side-by-side canvas,
 *  so we stack the panes vertically instead. Heuristic; tunable. */
export const WIDE_ASPECT_THRESHOLD = 2.2;

/** Aspect (width/height) of the union of all node geometry, or null if none has geometry. */
export function diagramAspect(index: GraphIndex): number | null {
  const rects = index.nodes.map(n => n.geometry).filter((g): g is NonNullable<typeof g> => !!g);
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map(r => r.x));
  const y1 = Math.min(...rects.map(r => r.y));
  const x2 = Math.max(...rects.map(r => r.x + r.width));
  const y2 = Math.max(...rects.map(r => r.y + r.height));
  const w = x2 - x1, h = y2 - y1;
  return h > 0 ? w / h : null;
}

/** Whether to use the stacked (diagram-on-top) layout instead of side-by-side. */
export function isWideDiagram(index: GraphIndex, threshold = WIDE_ASPECT_THRESHOLD): boolean {
  const a = diagramAspect(index);
  return a !== null && a > threshold;
}

export type SceneLayout = "stacked" | "side-by-side";
export function sceneLayout(index: GraphIndex, threshold = WIDE_ASPECT_THRESHOLD): SceneLayout {
  return isWideDiagram(index, threshold) ? "stacked" : "side-by-side";
}
