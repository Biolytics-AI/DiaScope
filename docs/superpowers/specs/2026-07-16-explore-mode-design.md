# DiaScope v2 — Explore Mode (sub-project 1)

**Date:** 2026-07-16
**Status:** Approved (design), pending spec review
**Scope:** Sub-project 1 of 3 (see [[../../../README.md]] roadmap note). Sub-projects 2
(audience lenses) and 3 (document-driven reveal chapter structure) are separate, independent
spec/plan/implementation cycles.

## Summary

Viewers can break away from the authored narration to explore the diagram themselves — click
any node to isolate its neighborhood, click a container to drill into its children — then
return to exactly the narrative step they left. This implements the `isolate` and
`expand`/`collapse` verbs already sitting in the schema as deferred/validated-but-unrendered
(`packages/core/src/capabilities.ts`), but as a **client-side interaction**, not as document
verbs `resolveStep` renders — see Architecture for why.

## Decisions

1. **Entry/exit is an explicit toggle**, not implicit on click. A small icon button in the
   canvas's top-right corner (the slot the legacy C2F embed already uses for its fullscreen
   button) switches explore mode on/off. Escape also exits.
2. **Isolating replaces, never stacks.** Clicking a different node while exploring re-targets;
   there is no multi-select.
3. **Snap-back target is exactly the step you left.** Entering/exiting explore mode never
   touches `stepIndex`. This falls out of the architecture for free (see below).
4. **Expand/collapse is unified with isolate as one click behavior, branching on node type.**
   Click a **container** node (has children in the `GraphIndex`) → drill into it. Click a
   **leaf** node → isolate it. No separate expand/collapse UI control.
5. **Reveal navigation is untouched.** Arrow keys keep doing exactly what they do today;
   explore mode never intercepts them.
6. **A step change while exploring auto-exits explore mode.** If reveal advances/retreats a
   fragment while the viewer is exploring (e.g. a presenter's arrow-key press), the narration
   pane's text is about to change out from under the isolated/drilled diagram view — snapping
   back to the (new) authored state automatically avoids a broken-looking mismatch between the
   diagram and the narration.

Out of scope for v1: multi-node isolation, a manual expand/collapse control separate from the
unified click, drawer access to annotated-node detail while exploring (drawer/popover/tooltip
are all suppressed while active — same suppression pattern already used between the drawer and
popovers today), any persistence of explore state (never serialized, never touches the
document).

## Architecture

**Explore mode replaces the rendered `SceneState` with a neutral, fully-visible base while
active, and restores the authored state instantly on exit — it never reads from or writes to
the authored per-step state.** (This corrects the "overlay on top of the authored state" framing
floated during brainstorming: dimming/hiding chosen by the *current step* has no reason to
constrain what the viewer can explore — entering explore mode should feel like stepping back to
survey the whole diagram, not exploring through the current step's blinders.)

```
applyExploreOverlay(authored: SceneState, explore: ExploreState, index: GraphIndex): SceneState
```

- `!explore.active` → returns `authored` unchanged (identity — this is the whole reason exit is
  instant and step-accurate; nothing needs to be "restored," the pure authored value was never
  touched).
- `active && target === null` → a neutral base: all nodes visible, nothing highlighted or
  dimmed, `cameraFit` = all nodes. (Narration `text` still comes from `authored.text`, so the
  pane keeps showing the step you're on — only the diagram view changes.)
- `active && target.kind === "isolate"` → `highlighted` = `[nodeId, ...directNeighborIds]`
  (neighbors from `index.edges` touching `nodeId`), `dimmed` = every other visible node,
  `cameraFit` = the highlighted set. `traced` = the edges directly connecting `nodeId` to each
  neighbor (reuses the existing `ds-trace` visual language, so a drawn line, not just two glowing
  boxes, indicates "isolated together").
- `active && target.kind === "drill"` → `children` = `index.nodes` where `parent === containerId`.
  If `children.length === 0` (a childless container — shouldn't occur for a real D2 container,
  but degrade gracefully), treat the click as `isolate` on `containerId` instead. Otherwise:
  `highlighted` = `[containerId, ...children.map(c => c.id)]`, `dimmed` = everything else,
  `cameraFit` = the highlighted set. This reuses `focus`'s existing dim-the-rest visual language
  (not `hide`) — surrounding context stays visible but de-emphasized, consistent with how
  authored steps already read.

This function lives in **`@diascope/react`** (`packages/react/src/explore.ts`), not
`@diascope/core`. (Correction from brainstorming, where `@diascope/core` was floated: explore
state is a pure renderer/UI-interaction concept with no document representation, no
serialization, and no place in the JSON Schema or authoring guide — it doesn't belong in core's
public surface, which is scoped strictly to the canonical document and its pure resolution.)

Because the output is a plain `SceneState`, **`GraphCanvas`, `state-classes.ts`, `camera.ts`, and
`PopoverLayer` need zero changes.** `TwoPaneScene` computes
`renderedState = applyExploreOverlay(authoredState, exploreState, index)` and passes that instead
of the raw `authoredState` — the rest of the render pipeline is unaware explore mode exists.

### Types

```ts
// packages/react/src/explore.ts
export type ExploreTarget =
  | { kind: "isolate"; nodeId: string }
  | { kind: "drill"; containerId: string };

export interface ExploreState {
  active: boolean;
  target: ExploreTarget | null;
}

export const INACTIVE_EXPLORE_STATE: ExploreState = { active: false, target: null };

export function applyExploreOverlay(authored: SceneState, explore: ExploreState, index: GraphIndex): SceneState;

/** Classifies a click: containers (have children in `index`) drill, everything else isolates.
 *  Also handles the "click the currently-drilled container again → zoom back out" and
 *  "click the currently-isolated node again → no-op" toggle behavior. */
export function nextExploreTarget(clickedId: string, current: ExploreTarget | null, index: GraphIndex): ExploreTarget | null;

/** Ancestor chain (root → containerId) for breadcrumb rendering, derived from `index` parent
 *  links — no manually-tracked drill history needed. */
export function drillBreadcrumb(containerId: string, index: GraphIndex): string[];
```

## UI changes (`packages/react/src/TwoPaneScene.tsx`)

- New `exploreState` (React state, `useState<ExploreState>(INACTIVE_EXPLORE_STATE)`), owned by
  `TwoPaneScene` alongside the existing `drawer`/`tooltip`/`binding` state.
- **Toggle button**: top-right of `.ds-canvas-wrap`, labeled "Explore" / "Exploring · Exit".
  Clicking sets `active` (clearing `target`); Escape (captured the same way the drawer already
  captures it) exits fully.
- **Breadcrumb**: rendered only when `target?.kind === "drill"`, small chip row (reusing pill
  styling) below the toggle, built from `drillBreadcrumb(target.containerId, index)`. Clicking a
  crumb re-targets to that ancestor container.
- **`onNodeClick` branches on `exploreState.active`**: while exploring, every click routes
  through `nextExploreTarget` instead of the existing `scene?.annotations?.nodes?.[id] →
  setDrawer` check (drawer access is unavailable while exploring, per the out-of-scope list —
  the existing branch is preserved unchanged for when explore mode is off).
- **`interactiveNodeIds` (keyboard access) widens while exploring**: today this is
  `Object.keys(scene?.annotations?.nodes ?? {})` (only annotated nodes get `tabindex`/`role`).
  While exploring it becomes every node id — `GraphCanvas` already supports "make these ids
  keyboard-focusable + Enter/Space-clickable" (Task 12), so this is a one-line change, not new
  `GraphCanvas` logic. **Mouse clicks already fire `onNodeClick` for every node today** —
  `GraphCanvas`'s hit-test map is built from `index.nodes` unconditionally; `interactiveNodeIds`
  only ever controlled keyboard affordance, not mouse routing. So the only real wiring is the
  `onNodeClick` branch above plus this keyboard-id widening.
- **Popover/tooltip/drawer suppressed while exploring**: extend the existing
  `{!drawer && <PopoverLayer .../>}` conditional to `{!drawer && !exploreState.active && ...}`;
  tooltip/drawer already won't populate since `onEdgeHover`/`onNodeClick` are redirected.
- **Auto-exit on step change (decision 6)**: a `useEffect` keyed on `stepIndex` that resets
  `exploreState` to `INACTIVE_EXPLORE_STATE` whenever `stepIndex` changes (skipping the initial
  mount) — this is the only place `TwoPaneScene` needs to know about reveal-driven navigation at
  all; `NarrativeScene`/reveal integration is completely unaware explore mode exists.

## Testing

**Unit (`packages/react/tests/explore.test.ts`)**, mirroring `resolveStep`'s test style:
- `applyExploreOverlay`: inactive → identity (reference equality even); active+no target →
  neutral all-visible/no-dim/cameraFit-all; active+isolate → correct highlighted/dimmed/traced/
  cameraFit for a node with 0, 1, and 3 neighbors; active+drill → children highlighted, rest
  dimmed (not hidden), cameraFit = container+children; drill on a childless id falls back to
  isolate.
- `nextExploreTarget`: leaf → isolate; container → drill; re-click the current isolate target →
  unchanged (no-op, still simplest to reason about as idempotent); re-click the current drill
  target → `null` (zoom back out); click an unrelated container while mid-drill → replaces
  (decision 2, "replaces never stacks" applies to drill targets too, not just isolate).
- `drillBreadcrumb`: root container → single-element chain; nested container → full ancestor
  chain in root-to-leaf order; unknown id → empty array (defensive, shouldn't occur).

**Component (`packages/react/tests/two-pane.test.tsx` additions)**: toggle renders and flips
`exploreState.active`; leaf click while inactive still opens the drawer (regression guard —
this is the branch most likely to break silently); leaf click while active isolates and does
NOT open the drawer even for an annotated node; container click while active drills and shows
the breadcrumb; re-clicking the same drilled container zooms back out; clicking a breadcrumb
crumb re-targets; Escape and the exit button both fully deactivate; a `stepIndex` prop change
while active resets `exploreState` (auto-exit).

**Browser (Playwright, `demo/deck/tests/layout.spec.ts` additions)**: while exploring, popover/
tooltip/drawer parts never appear in `window.__diascopeDebug.layout()`; the breadcrumb and
toggle stay contained within the canvas (no pane overlap); their hit areas meet the existing
≥24px target-size bar; Tab reaches every node while exploring (not just annotated ones), Enter
isolates/drills identically to a click; a full explore → isolate → drill → breadcrumb-back →
exit walk produces zero console errors, screenshotted at each stage.

## File structure

```
packages/react/src/
├── explore.ts          NEW — ExploreState/ExploreTarget, applyExploreOverlay,
│                        nextExploreTarget, drillBreadcrumb (pure, no React)
├── TwoPaneScene.tsx     MODIFIED — owns exploreState, toggle button, breadcrumb,
│                        onNodeClick branch, interactiveNodeIds widening, auto-exit effect
├── styles.css           MODIFIED — .ds-explore-toggle, .ds-explore-breadcrumb
└── index.ts             MODIFIED — export * from "./explore.js"

packages/react/tests/
├── explore.test.ts      NEW
└── two-pane.test.tsx    MODIFIED (additions above)

demo/deck/tests/
└── layout.spec.ts       MODIFIED (additions above)
```

No changes anywhere else — `@diascope/core`, `@diascope/d2`, `@diascope/reveal`, `@diascope/cli`,
and the authoring guide are all untouched by this sub-project.
