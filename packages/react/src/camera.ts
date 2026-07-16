export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type ViewBox = Rect;

/**
 * Pads `bounds` by `padFraction` of its longer side, then letterboxes the result to
 * `containerAspect` (width/height) by symmetrically expanding whichever dimension is too
 * narrow. Never crops — the returned viewBox always fully contains the padded bounds.
 *
 * Guards against zero-area bounds (e.g. a single-point cameraFit, or a node with no
 * geometry yet): width/height are floored to MIN_EXTENT before padding so the result never
 * degenerates to a zero-size or NaN viewBox, while keeping the original bounds.x/y centered.
 */
export function fitViewBox(bounds: Rect, containerAspect: number, padFraction = 0.08): ViewBox {
  const MIN_EXTENT = 1;
  const w = Math.max(bounds.width, MIN_EXTENT);
  const h = Math.max(bounds.height, MIN_EXTENT);
  const pad = Math.max(w, h) * padFraction;
  let x = bounds.x - (w - bounds.width) / 2 - pad;
  let y = bounds.y - (h - bounds.height) / 2 - pad;
  let width = w + 2 * pad;
  let height = h + 2 * pad;

  const aspect = width / height;
  if (aspect < containerAspect) {
    const newWidth = height * containerAspect;
    x -= (newWidth - width) / 2;
    width = newWidth;
  } else {
    const newHeight = width / containerAspect;
    y -= (newHeight - height) / 2;
    height = newHeight;
  }
  return { x, y, width, height };
}

/**
 * The inner→outer coordinate transform introduced by D2's nested-SVG output. D2 wraps the
 * laid-out diagram in an inner `<svg class="d2-svg" viewBox="minX minY W H" width height>`,
 * so a node's index geometry — expressed in that inner viewBox's *content* space — actually
 * renders at `(geom - min) * (size / viewBoxSize)` in the OUTER svg's user space, which is
 * the space our camera viewBox and diagramToScreen operate in. D2's default `min` is a
 * negative pad (e.g. -89), so ignoring this transform offsets every camera fit and popover
 * by that pad — the up-and-left popover/camera drift Task 17 exists to eliminate.
 */
export interface ContentTransform {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
}

export const IDENTITY_CONTENT_TRANSFORM: ContentTransform = { tx: 0, ty: 0, sx: 1, sy: 1 };

/** Parse an SVG length attribute, but only when it is a plain number (not "100%", "10px", …). */
const numericAttr = (v: string | null): number => (v && /^-?[\d.]+$/.test(v.trim()) ? parseFloat(v) : NaN);

/**
 * Derives the inner→outer ContentTransform by reading the nested d2 `<svg>` inside `outerSvg`.
 * Returns identity when there is no nested svg / viewBox (e.g. an unexpected structure), so
 * callers degrade to the un-offset behavior rather than producing NaN positions. When the
 * inner svg's width/height attributes aren't plain numbers, the scale falls back to 1 (D2
 * always emits width == viewBox width, i.e. a pure translate by the viewBox min).
 */
export function readContentTransform(outerSvg: SVGSVGElement): ContentTransform {
  const inner = outerSvg.querySelector("svg");
  const vb = inner?.getAttribute("viewBox");
  if (!inner || !vb) return IDENTITY_CONTENT_TRANSFORM;
  const [minX, minY, vbW, vbH] = vb.trim().split(/\s+/).map(Number);
  if (![minX, minY, vbW, vbH].every(Number.isFinite) || !vbW || !vbH) return IDENTITY_CONTENT_TRANSFORM;
  const w = numericAttr(inner.getAttribute("width"));
  const h = numericAttr(inner.getAttribute("height"));
  const sx = Number.isFinite(w) ? w / vbW : 1;
  const sy = Number.isFinite(h) ? h / vbH : 1;
  // `|| 0` normalizes the -0 that -minX*sx yields when minX is 0, keeping equality clean.
  return { tx: -minX * sx || 0, ty: -minY * sy || 0, sx, sy };
}

/** Maps a rect from D2's inner content space into the outer svg user space via `t`. */
export function applyContentTransform(r: Rect, t: ContentTransform): Rect {
  return { x: r.x * t.sx + t.tx, y: r.y * t.sy + t.ty, width: r.width * t.sx, height: r.height * t.sy };
}

/** Componentwise linear interpolation between two rects at t in [0, 1]. */
export function interpolateRect(a: Rect, b: Rect, t: number): Rect {
  const lerp = (p: number, q: number) => p + (q - p) * t;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), width: lerp(a.width, b.width), height: lerp(a.height, b.height) };
}

/** Standard quadratic ease-in-out: easeInOut(0) === 0, easeInOut(1) === 1, monotonic in between. */
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Maps a rect from diagram space into screen-pixel space, given the current SVG viewBox
 * and the container's pixel size, replicating the browser's `preserveAspectRatio="xMidYMid
 * meet"` behavior (uniform scale, centered letterboxing on whichever axis has slack).
 */
export function diagramToScreen(rect: Rect, viewBox: ViewBox, container: { width: number; height: number }): Rect {
  const scale = Math.min(container.width / viewBox.width, container.height / viewBox.height);
  const offsetX = (container.width - viewBox.width * scale) / 2;
  const offsetY = (container.height - viewBox.height * scale) / 2;
  return {
    x: offsetX + (rect.x - viewBox.x) * scale,
    y: offsetY + (rect.y - viewBox.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/**
 * Animates an SVG element's viewBox attribute from its current value to `to` over `ms`
 * milliseconds, eased with easeInOut. Respects `prefers-reduced-motion: reduce` (and
 * environments without requestAnimationFrame) by setting the target instantly instead.
 * Returns a cancel function.
 */
export function animateViewBox(svg: SVGSVGElement, to: ViewBox, ms = 600): () => void {
  const prev = (svg.getAttribute("viewBox") ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  const from: ViewBox =
    prev.length === 4 && prev.every(Number.isFinite)
      ? { x: prev[0], y: prev[1], width: prev[2], height: prev[3] }
      : to;

  const set = (r: ViewBox) => svg.setAttribute("viewBox", `${r.x} ${r.y} ${r.width} ${r.height}`);

  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof requestAnimationFrame === "undefined") {
    set(to);
    return () => {};
  }

  // Derive the animation's start time from the first requestAnimationFrame timestamp
  // rather than a separately-called performance.now(): some environments (observed under
  // vitest's jsdom test environment) hand rAF callbacks timestamps from a different clock
  // origin than the ambient `performance.now()`, which would otherwise make `now - start`
  // wildly wrong on the first tick.
  let start: number | null = null;
  let raf = 0;
  const tick = (now: number) => {
    if (start === null) start = now;
    const t = Math.min(1, (now - start) / ms);
    set(interpolateRect(from, to, easeInOut(t)));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
