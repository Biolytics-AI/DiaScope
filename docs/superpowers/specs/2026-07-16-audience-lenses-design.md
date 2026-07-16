# DiaScope v2 — Audience Lenses (sub-project 2)

**Date:** 2026-07-16
**Status:** Approved (v1, fast-tracked per user request)
**Scope:** Sub-project 2 of 3. Independent of sub-project 1 (explore mode, shipped) and
sub-project 3 (document-driven reveal structure).

## Summary

One diagram, multiple curated narrative paths for different audiences (legal, infra lead,
CFO — same graph, different story), switchable live inside one deck via a tab row, without
reloading. Chosen over the "separate documents per audience" alternative floated during
brainstorming because the whole point is letting a viewer pick their lens *in the moment*,
not by URL.

## Schema addition (backward compatible)

```ts
export const ViewSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});

export const SceneSchema = z.strictObject({
  id: z.string().min(1),
  layout: z.literal("two-pane").default("two-pane"),
  text: StepTextSchema.optional(),
  annotations: /* unchanged */,
  steps: z.array(StepSchema).min(1),
  views: z.array(ViewSchema).min(1).optional(),   // NEW
});
```

A scene with no `views` behaves exactly as today — `steps` is the one and only path. A scene
**with** `views` gets an implicit default view wrapping its own `steps` as `{ id: "default",
label: scene.text?.title ?? "Overview", steps: scene.steps }`, prepended to the authored
`views` array — so `scene.steps` stays the fallback/default lens and authors only write the
*additional* views. This means an author can add lenses incrementally to an existing scene
without touching its existing `steps`.

Selectors, verbs, and validation (`resolveStep`, `validateDocument`) are entirely unaware of
views — they operate on a **resolved step array** handed to them. The active-view resolution
happens one layer up, in `@diascope/react`, exactly like `applyExploreOverlay` in
sub-project 1: a pure function picks which step array is "in scope" before anything touches
`resolveStep`.

```ts
// packages/core/src/views.ts
export function effectiveSteps(scene: Scene): { id: string; label: string; steps: Step[] }[] {
  const fallback = { id: "default", label: scene.text?.title ?? "Overview", steps: scene.steps };
  return scene.views ? [fallback, ...scene.views] : [fallback];
}
```

`validateDocument` calls `effectiveSteps` and validates **every** view's steps (an author who
breaks the CFO lens should see that error, not just the default one) — each view's step array
gets independently visibility-folded and validated with paths like
`scenes[0].views[1].steps[2].focus[0]`.

## Rendering: active view is renderer state, not document state

```ts
// packages/react/src/lens.ts
export interface LensState { activeViewId: string }  // defaults to "default"
```

`TwoPaneScene` gains an optional `lensState`/`onLensChange` pair (uncontrolled by default,
defaulting to `"default"`). It looks up the active view via `effectiveSteps(scene)`, and calls
`resolveStep` against **that view's step array** instead of `scene.steps` directly — a one-line
change (`resolveStep` already takes a step array position; we resolve against the chosen
view's `steps`, at whatever `stepIndex` reveal's fragment count currently is).

**Switching lenses resets to step 0 of the new view.** Simplest, least surprising — a viewer
switching from "Infra" to "Legal" mid-story has no reason to expect the legal narrative to
pick up "at the same beat"; the two paths aren't aligned beat-for-beat.

## UI: tab row

Only rendered when `scene.views` is present (zero visual change for scenes without views).
Reuses the pill-row visual language (small chips, active state) but sits **above** the pill
row, labeled with each view's `label` (not step numbers) — this reads as "which story" vs. the
pills' "which beat," a clear visual hierarchy. Lives in `NarrativePane`, since it's about which
*narration* is showing, not the diagram.

```tsx
{views.length > 1 && (
  <nav data-diascope-part="lens-tabs" className="ds-lens-tabs" aria-label="View">
    {views.map(v => (
      <button key={v.id} aria-pressed={v.id === activeViewId} onClick={() => onLensChange(v.id)}>
        {v.label}
      </button>
    ))}
  </nav>
)}
```

## Reveal integration

Fragment count still drives `stepIndex` within whichever view is active — `NarrativeScene`
(the reveal adapter) is unaware lenses exist, exactly like it's unaware explore mode exists.
Switching lenses does **not** move reveal's fragment cursor; it resets the locally-derived
`stepIndex` display to 0 for the new view while reveal's own fragment count (tied to the
*default* view's step count) keeps whatever value it had. This is a real edge case: **the
CLI/authoring guide should recommend all views in a scene have the same step count**, so the
fragment markers (sized off `scene.steps.length`, i.e. the default view) don't run out or
overshoot for a shorter/longer alternate view. `clampStep` (already in `@diascope/reveal`)
already protects against overshoot regardless.

## CLI / validation surface

`graph inspect` unaffected. `validate` reports errors/warnings per-view with the
`scenes[i].views[j].steps[k]...` path prefix shown above. `resolve` gains an optional
`--view <id>` flag (defaults to `"default"`) to preview a specific lens's step state.

## Out of scope for v1

Per-lens diagram styling (a lens always sees the same D2 compile — only which steps/narration
show differs), URL-addressable lens selection (`?view=legal` — cheap follow-up if wanted,
not required for the tab-switcher UX), animating the diagram transition between lenses beyond
what a normal step-change camera animation already does.

## Testing

Unit: `effectiveSteps` (no views → single default; with views → default prepended, authored
views preserved in order). Validation: each view's steps get independently-pathed errors.
Component: tab row renders only when `views.length > 1`; switching resets `stepIndex` state to
0; default view matches pre-lens behavior exactly (regression). Browser: switch lens mid-deck,
confirm diagram re-fits to the new view's step 0, zero console errors, tabs contained within
the pane, ≥24px hit areas (existing pattern).
