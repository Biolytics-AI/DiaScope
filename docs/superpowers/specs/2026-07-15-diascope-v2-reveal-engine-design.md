# DiaScope v2 — Graph-Native Presentation Engine (reveal.js first)

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Milestone:** 1 — vertical slice

## Summary

Rebuild DiaScope from a single-file HTML story builder into a **graph-native presentation engine**: a framework-neutral canonical narrative document (AST) describing scenes and steps over a D2 diagram, rendered by a React runtime, hosted first inside reveal.js via the official `@revealjs/react` wrapper. Narrative steps map onto reveal.js fragments so reveal owns navigation, presenter mode, overview, and URL state, while DiaScope owns all graph/narrative semantics.

The presentation framework must never own narrative semantics. The GUI (future), the agent CLI, and every host adapter (reveal, Slidev, standalone) are all clients of the same canonical document.

## Decisions made (with user)

1. **Milestone 1 = vertical slice**: `core` + `d2` + `react` + `reveal` + demo deck. Slidev addon, studio/GUI, standalone port, and classic (non-React) reveal plugin are deferred.
2. **Monorepo, keep legacy publishing**: this repo becomes an npm-workspaces monorepo. The current code moves to `packages/diascope` unchanged, keeps the npm name `@biolytics.ai/diascope`, and keeps publishing until a later milestone ports the standalone builder onto the new core.
3. **M1 grammar = parity + signature moves**: everything the current viewer does (show, highlight, dim/focus, camera-fit, detail panels, edge tooltips) re-expressed as AST verbs, plus `trace` (animated edge path) and step-anchored `popover`. The schema parses and validates the **full** verb vocabulary from day one; renderers declare capabilities and warn-and-skip verbs they don't implement.
4. **Near-future constraint (first-class)**: a GUI for humans and a CLI for agents will both consume the canonical document. Therefore M1 already includes: Zod schema + generated JSON Schema, deterministic canonical serialization, graph-resolution validation with suggestions, and a slim agent CLI (`validate`, `graph inspect --json`).

## Verified facts

- `@revealjs/react` is the official React wrapper (v0.2.1, published by hakimel), providing `Deck`, `Slide`, `Stack`, `Fragment`, event props, and reveal API access. reveal.js is at 6.0.1.
- `@terrastruct/d2` (v0.1.33) is the official WASM build of D2 as a JS package; it compiles D2 in both Node and the browser. This enables future GUI live-preview without a `d2` binary on PATH.

## Repo layout

```text
DiaScope/                     (workspace root, private)
├── packages/
│   ├── diascope/             legacy package moved as-is; keeps name
│   │                         @biolytics.ai/diascope, keeps publishing
│   ├── core/                 @diascope/core: canonical AST, no DOM deps
│   ├── d2/                   @diascope/d2: compile + semantic index
│   ├── react/                @diascope/react: canvas, camera, panes
│   ├── reveal/               @diascope/reveal: fragment adapter + plugin
│   └── cli/                  @diascope/cli: agent-facing validate/inspect
├── demo/deck/                @revealjs/react + Vite demo (not published)
├── docs-site/                (unchanged)
└── examples/                 (unchanged; vLLM example reused by demo)
```

- New packages are `private: true` in M1; npm scope naming is a publish-time decision.
- Root `package.json` becomes a private workspace root; root scripts orchestrate build/test across workspaces.
- The legacy package keeps its own esbuild/tsc setup untouched; its tests must stay green throughout the restructure.

## Package designs

### `core` — canonical narrative document

Framework-neutral, DOM-free. Owns all narrative semantics.

**Document shape** (authored as YAML or JSON):

```yaml
version: 1
graph:
  source: architecture.d2
scenes:
  - id: inference-overview
    layout: two-pane
    text: { title: "...", body: "..." }
    steps:
      - id: retrieval
        focus: [retriever, vector-db]
        highlight: [retriever]
        dim: { not: { class: inference } }
        trace: request -> retriever -> vector-db
        popover: { target: vector-db, content: "..." }
        camera: { fit: selection }
```

**Verb vocabulary** — all parsed and validated in M1: `show, hide, focus, highlight, dim, trace, annotate, popover, camera, waitFor, compare, isolate, expand, collapse`. M1 renderer implements: `show, hide, focus, highlight, dim, trace, popover, camera` (fit). Node detail panels and edge tooltips are **scene-level `annotations`** (a map of node/edge id → content, distinct from the step-level `annotate` verb, which is deferred); the M1 renderer implements them as click-to-open drawers and hover tooltips, matching legacy behavior. Core exposes a capability manifest; renderers warn and no-op on unsupported verbs.

**Selectors** — resolved against the graph index, never against SVG:

- `"node-id"` (exact, dot notation for nesting)
- `{ class: "inference" }`
- `{ not: <selector> }`
- `edge: "a->b"`, `path: "a->b->c"`

**State resolution is pure.** `resolveStep(doc, sceneId, stepIndex, graphIndex) → SceneState` where `SceneState = { visible, highlighted, dimmed, traced, popovers, camera }`. Forward and backward navigation are both "compute the target state"; the React layer animates between successive states. This makes reveal's `fragmenthidden` reversal trivial and gives the future GUI scrubbing/timeline for free. No imperative transitions live in core.

**Other core responsibilities:**

- Zod schema + generated JSON Schema artifact (for agents and the GUI).
- Deterministic canonical serialization (stable key order) for GUI round-tripping and clean diffs.
- Validation: every selector resolves against the graph; unknown ids error with did-you-mean suggestions.
- `fromLegacyStory()`: converts old `story.yaml` (steps.nodes → highlight + camera-fit; `detail_panels` → node annotations; `edge_tooltips` → edge annotations; `overview` → an overview step).

### `d2` — graph adapter

- `D2Compiler` interface: `compile(source) → { svg, graphIndex }` with `graphIndex = { nodes: [{id, label, classes, parent}], edges: [{id, source, target, label}] }`.
- **Primary impl:** `@terrastruct/d2` (WASM). Its compile output exposes the diagram object (shapes/connections), so the index comes from structured data, not SVG scraping.
- **Fallback impl:** `CliCompiler` shelling out to the `d2` binary (kept for TALA layouts / legacy parity), index extracted from `d2` JSON output or source parsing.
- `SvgGraphBinding`: maps semantic ids → SVG elements/bounds (adapting legacy `tagging.ts`). This is the **only** layer that knows D2's SVG structure.
- Exports the machine-readable `inspect()` inventory served by the agent CLI.

### `react` — renderer

- `<GraphCanvas>`: inline SVG; applies `SceneState` as CSS classes; camera is a **controlled viewBox with rAF interpolation** — `svg-pan-zoom` is dropped in the new renderer (imperative, fights React); wheel/drag/pinch handlers are owned code. Respects `prefers-reduced-motion`.
- `trace`: stroke-dashoffset animation along resolved edge paths, sequenced along the path.
- `<PopoverLayer>`: popovers anchored to node bounds from `SvgGraphBinding`.
- `<TwoPaneScene>` + `<NarrativePane>`: the familiar DiaScope layout (diagram + narration), themable.
- `useNarrative(graphSource, doc)`: loads/compiles, exposes `{ steps, state, goto(i) }`.

### `reveal` — host adapter (thin by design)

- `<NarrativeScene graph scene>`: renders the two-pane scene and emits **one invisible `<Fragment>` marker per step** — authors never manage fragment indices. `fragmentshown`/`fragmenthidden` drive `goto(i)`.
- Minimal reveal plugin (`id: 'diascope'`) for deck-level wiring; composes with `@revealjs/react`'s `Deck/Slide/Stack/Fragment`.
- Reveal owns: navigation, presenter mode, overview, URL state, export. DiaScope owns: graph state, camera, popovers, narration content.

### `cli` — agent surface (slim)

Two commands in M1, thin wrappers over core/d2 (bin name `diascope2` is provisional — final name decided at publish time; the legacy `diascope` bin must not be shadowed):

- `diascope2 validate <doc.yaml>` — schema + graph-resolution errors, `--json` output mode.
- `diascope2 graph inspect <file.d2> --json` — machine-readable node/edge inventory.

Grows `build --target reveal|slidev|standalone` in later milestones. The legacy `diascope` bin is untouched.

### Demo deck (`demo/deck`)

Vite + `@revealjs/react` app using the existing vLLM example: horizontal slides as chapters, one vertical stack as a drill-down, steps using `trace` and `popover`. **This is the milestone's acceptance artifact**: arrow keys → fragments → graph state transitions, forward and backward, plus reveal overview mode and presenter view working.

## Testing

- `core`: golden tests for state resolution (every implemented verb; forward/backward equivalence), selector resolution, legacy conversion, serialization round-trip.
- `d2`: index extraction against `examples/`; binding correctness (id → element) via jsdom.
- `react`: testing-library assertions that `SceneState` produces correct classes/viewBox.
- `demo`: Playwright smoke (already a dev dep) — keypress through the deck, assert highlighted nodes per step.
- Legacy package tests keep running unchanged in the workspace.

## Verification & polish protocol (M1 acceptance)

Static tests alone do not close the milestone. Acceptance requires all four phases:

**Phase A — static tests.** Everything in the Testing section green across all workspaces.

**Phase B — agentic authoring test.** Dispatch fresh subagents (no implementation context) that author *new* diagrams and walkthroughs from scratch using only the agent CLI (`validate`, `graph inspect --json`), the generated JSON Schema, and the docs — then build working decks from them. Success means an agent can go from "explain system X" to a valid, playing deck without human fixes. This directly tests the agent-authorability design goal. When the GUI ships in a later milestone, the same protocol extends to GUI-driven authoring.

**Phase C — browser layout verification.** Drive Chrome against the demo deck and the agent-authored decks (Playwright and/or DevTools):

- Screenshot every step of every scene, forward and backward, at desktop and narrow viewports.
- Not screenshots alone: instrument the renderer with a debug hook (e.g. `window.__diascopeDebug.layout()`) that reports bounding boxes (`getBoundingClientRect`) for the canvas, narration pane, popovers, step pills, drawers, and highlighted nodes — logged to console and asserted programmatically.
- Assert: no unintended overlap or touching between components (popover vs. its target node, narration pane vs. canvas, pill row overflow, drawer vs. tooltip); highlighted nodes fully inside the camera viewport after each transition.

**Phase D — design-quality iteration.** Run the `/audit`, `/animate`, and `/polish` skills against the rendered decks (diagrams *and* narration). Fix findings, re-run Phase C, re-audit. Loop until Phase C passes with zero violations and the audit comes back clean — "works flawlessly and looks amazing" is the bar, not "tests pass."

## Error handling

- Unknown node ids fail validation with did-you-mean suggestions.
- Unimplemented verbs: renderer warns once and no-ops (schema still validates them).
- Missing WASM asset / `d2` binary: actionable error naming the fix.
- Selector resolving to zero nodes: validation warning (may be intentional with classes, but flagged).

## Explicitly deferred (later milestones)

- Slidev addon; studio/GUI; port of the standalone HTML builder onto the new core; classic (non-React) reveal plugin; rendering for `compare/isolate/expand/collapse/waitFor`; npm publishing of the new packages; retiring the legacy viewer.

## GUI/CLI forward-compatibility notes

The future editor (per research: Slides.com as UX benchmark, Parallax as reveal implementation reference, Strut as spatial-narrative reference) edits the canonical document — never reveal HTML, JSX, or fragments. Everything the GUI needs is being built in M1: pure state resolution (timeline scrubbing), deterministic serialization (round-trip), JSON Schema (inspectors/validation), graph inventory (node pickers), and browser-side D2 compilation via WASM (live preview).
