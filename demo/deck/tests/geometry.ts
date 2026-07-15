export interface Rect { x: number; y: number; width: number; height: number }
export const right = (r: Rect) => r.x + r.width;
export const bottom = (r: Rect) => r.y + r.height;
export function overlaps(a: Rect, b: Rect, minGap = 0): boolean {
  return !(right(a) + minGap <= b.x || right(b) + minGap <= a.x || bottom(a) + minGap <= b.y || bottom(b) + minGap <= a.y);
}
export function contains(outer: Rect, inner: Rect, tolerance = 2): boolean {
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance &&
    right(inner) <= right(outer) + tolerance && bottom(inner) <= bottom(outer) + tolerance;
}
export function center(r: Rect) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
export function distance(a: Rect, b: Rect): number {
  // minimal edge-to-edge distance between two rects (0 if touching/overlapping)
  const dx = Math.max(b.x - right(a), a.x - right(b), 0);
  const dy = Math.max(b.y - bottom(a), a.y - bottom(b), 0);
  return Math.hypot(dx, dy);
}
