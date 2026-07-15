# Adaptive stacked layout for wide diagrams

**Date:** 2026-07-15
**Status:** Approved (user chose the stacked-layout strategy)
**Context:** Milestone 1 deferred a "wide-diagram layout strategy." Porting the real C2F
functionality-flow walkthrough (a ~4:1 `direction: right` diagram) demonstrated the gap:
the side-by-side two-pane layout gives a roughly-square canvas (~1.3:1), so a 4:1 diagram
fits to width and wastes ~65% of the canvas height as letterbox dead-space.

## Root cause

The camera letterboxes because the **canvas aspect doesn't match the diagram aspect**. In
side-by-side layout (`.ds-scene-inner` = flex row: canvas + 320px pane) the canvas is always
~1.3:1 regardless of the diagram. A diagram far wider than that can only fill the frame's
width.

## Fix: orient the layout to the diagram

When the diagram is much wider than a side-by-side canvas can present well, **stack the panes
vertically**: diagram full-width on top, narration as a short wide band below. This makes the
canvas wide-and-short (~2.6–2.9:1), which nearly matches a wide diagram, so the camera fills
the frame with little letterbox.

Everything downstream already adapts to the canvas box shape:
- `GraphCanvas` derives its camera aspect from `hostRef.clientWidth/clientHeight` and re-fits
  on size change via its `ResizeObserver` (added in Task 17). A shorter, wider host → wider
  camera aspect → less letterbox. No camera-code change needed.
- `PopoverLayer` positions from `canvasWrapRef` measured size (via `TwoPaneScene`'s
  `ResizeObserver`), so popover placement stays correct in the new box.
- The drawer is absolutely positioned inside the canvas wrap — unaffected.

So the change is: (1) decide orientation, (2) express it in the DOM, (3) CSS for the stacked
box. No changes to camera math, popovers, binding, or the reveal adapter.

## Decision rule (pure, testable)

Decide **once per document** from the diagram's true aspect (union of all node geometry in the
`GraphIndex`), so the layout never thrashes between steps (all scenes share one diagram).

```
diagramAspect(index) = unionBounds(node.geometry).width / .height   (null if no geometry)
isWideDiagram(index, threshold = 2.2) = diagramAspect > threshold
```

Threshold `2.2` is a heuristic: a diagram wider than ~2.2:1 fills < ~60% of a ~1.3:1
side-by-side canvas's height. It is a named constant, tunable, and overridable via prop for
tests. The rule depends only on the index geometry — no pixel measurement, no thrash.

## DOM + CSS

`TwoPaneScene` computes `isWideDiagram(index)` (memoized on `index`) and sets
`data-diascope-layout="stacked" | "side-by-side"` on the `.ds-scene` root.

CSS adds a stacked variant that flips `.ds-scene-inner` to a column (canvas first → top, pane
second → bottom) and reshapes the pane into a full-width short band:

```css
.ds-scene[data-diascope-layout="stacked"] .ds-scene-inner { flex-direction: column; }
.ds-scene[data-diascope-layout="stacked"] .ds-pane {
  flex: 0 0 auto; width: 100%; max-height: 34%;
}
/* pane internals reflow to use horizontal space (pills row + title/body) — tuned in-browser */
```

The existing narrow-viewport container query already flips to a column for small scene boxes;
the stacked path reuses the same column mechanics but is triggered by diagram aspect instead.
When both apply (wide diagram in a narrow box) they agree (column) — no conflict.

## Invariants preserved (Playwright, Task 17 suite)

- canvas ∩ pane = ∅ — holds (stacked = vertically separated, no overlap).
- pills ⊂ pane, popover ⊄ pane, popover near target, highlighted nodes ⊂ canvas viewport,
  drawer ⊂ scene — all hold, and highlighted-nodes-in-viewport *improves* (less letterbox).
- Add: in stacked mode the canvas sits **above** the pane (`canvas.bottom <= pane.top`).

## Testing

- Unit (`@diascope/react`): `diagramAspect` union math (single node, multi-node, no geometry);
  `isWideDiagram` at/above/below threshold; a `TwoPaneScene` test asserting the
  `data-diascope-layout` attribute is `stacked` for a wide synthetic index and `side-by-side`
  for a tall one.
- Browser: c2f-flow (wide → stacked) and the vLLM deck (wide → stacked) fill the frame far
  better; construct a tall/square diagram fixture to confirm the side-by-side path is
  unchanged. Re-run the full layout suite (both stories, both viewports) — all green, plus the
  new stacked "canvas above pane" assertion. Screenshot and eyeball proportions; tune the
  `max-height` / pane internals until it looks intentional.

## Out of scope (still deferred)

Auto-splitting a huge diagram into sub-scenes; region-first/scroll cameras; rotating a wide
diagram. Stacking handles the common wide-flow case (which is what real content produced) with
a small, contained change.
