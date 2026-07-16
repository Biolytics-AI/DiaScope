# Audience Lenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one document define multiple curated narrative paths (views) over the same diagram — e.g. a "Legal" lens and an "Infra" lens — switchable live via a tab row, without reloading.

**Architecture:** `@diascope/core` gains an optional `views` array on `Scene` and one new function, `resolveStepInView`, that resolves a step against a chosen view's steps by constructing a scene-patched copy of the document and delegating to the unchanged `resolveStep` — so the pure resolution core stays entirely unaware views exist. `@diascope/react`'s `TwoPaneScene` owns which view is active and renders a tab row; the CLI's `resolve` command gets a `--view` flag using the same core function.

**Tech Stack:** TypeScript, Zod, React 19, Vitest, @testing-library/react, Playwright, commander.

**Spec:** `docs/superpowers/specs/2026-07-16-audience-lenses-design.md` — read it first.

**Design refinement over the spec:** the spec sketched the scene-patching logic as living in `@diascope/react`. This plan moves it into `@diascope/core` instead (`resolveStepInView`), because the CLI's `resolve --view` needs the *exact same* logic and CLI only depends on `@diascope/core`/`@diascope/d2`, never `@diascope/react` — putting it in core avoids duplicating five lines identically in two packages.

---

## Conventions

- Branch `feat/diascope-v2-design` (already checked out — verify, don't switch).
- Explicit-path `git add` (never `-A`) — pre-existing untracked files (`packages/core/tests/zzz-probe.test.ts`, `packages/d2/probe-*.mjs`, `*.tsbuildinfo`) are permission-locked leftovers, leave them alone.
- `rm`/`kill` are permission-denied this session — never attempt; `mv` to scratchpad if you must relocate a scratch file.
- Don't touch `packages/diascope`.
- Build order when you need fresh dist: `npm run build -w @diascope/core` before `@diascope/react` or `@diascope/cli` (both depend on core's types).
- Commit after every task, prefix `feat(lens):`, `test(lens):`.

---

### Task 1: Core — `ViewSchema`, `Scene.views`, `effectiveSteps`, `resolveStepInView`

**Files:**
- Modify: `packages/core/src/schema.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/views.ts`
- Test: `packages/core/tests/views.test.ts`

**Context:** `packages/core/src/schema.ts` currently defines `SceneSchema` (id/layout/text/annotations/steps, `steps: z.array(StepSchema).min(1)`) and `StepSchema`. `packages/core/src/resolve.ts` exports `resolveStep(doc, sceneId, stepIndex, index): SceneState` — it looks up the scene by id in `doc.scenes` and reads `scene.steps` directly; it will NOT change in this plan. `SceneState`/`NarrativeDocument`/`Scene`/`Step`/`GraphIndex` types are already exported from `@diascope/core`'s index.

- [ ] **Step 1: Write the failing test** (`tests/views.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import type { GraphIndex, NarrativeDocument, Scene } from "../src/schema.js";
import { effectiveSteps, resolveStepInView } from "../src/views.js";

const index: GraphIndex = {
  nodes: [
    { id: "a", label: "A", classes: [], parent: null },
    { id: "b", label: "B", classes: [], parent: null },
  ],
  edges: [],
};

const sceneNoViews: Scene = {
  id: "main",
  layout: "two-pane",
  text: { title: "Overview" },
  steps: [{ id: "s0", camera: { fit: "all" } }, { id: "s1", focus: ["a"] }],
};

const sceneWithViews: Scene = {
  ...sceneNoViews,
  views: [
    { id: "legal", label: "Legal", steps: [{ id: "l0", focus: ["b"] }] },
    { id: "infra", label: "Infra", steps: [{ id: "i0", focus: ["a"] }, { id: "i1", focus: ["b"] }] },
  ],
};

describe("effectiveSteps", () => {
  it("a scene with no views produces a single implicit default view wrapping scene.steps", () => {
    const views = effectiveSteps(sceneNoViews);
    expect(views).toEqual([{ id: "default", label: "Overview", steps: sceneNoViews.steps }]);
  });

  it("a scene with views prepends the default view before the authored ones, in order", () => {
    const views = effectiveSteps(sceneWithViews);
    expect(views.map(v => v.id)).toEqual(["default", "legal", "infra"]);
    expect(views[0].steps).toBe(sceneWithViews.steps);
    expect(views[1]).toEqual({ id: "legal", label: "Legal", steps: sceneWithViews.views![0].steps });
  });

  it("the default view's label falls back to the scene title, defaulting to 'Overview' when the scene has no text", () => {
    const untitled: Scene = { id: "x", layout: "two-pane", steps: sceneNoViews.steps };
    expect(effectiveSteps(untitled)[0].label).toBe("Overview");
  });
});

describe("resolveStepInView", () => {
  const doc: NarrativeDocument = { version: 1, graph: { source: "g.d2" }, scenes: [sceneWithViews] };

  it("defaults to the 'default' view, matching plain resolveStep on scene.steps", () => {
    const s = resolveStepInView(doc, "main", "default", 1, index);
    expect(s.highlighted).toEqual(["a"]);
  });

  it("resolves against an authored view's own steps", () => {
    const s = resolveStepInView(doc, "main", "legal", 0, index);
    expect(s.highlighted).toEqual(["b"]);
  });

  it("an unknown view id falls back to the default view", () => {
    const s = resolveStepInView(doc, "main", "nope", 0, index);
    expect(s.highlighted).toEqual([]); // default view step 0 has no focus
  });

  it("clamps an out-of-range stepIndex to the chosen view's step count instead of throwing", () => {
    // "legal" has only 1 step; requesting step 5 must clamp to its last valid index (0), not throw.
    expect(() => resolveStepInView(doc, "main", "legal", 5, index)).not.toThrow();
    const s = resolveStepInView(doc, "main", "legal", 5, index);
    expect(s.highlighted).toEqual(["b"]);
  });

  it("clamps a negative stepIndex to 0", () => {
    const s = resolveStepInView(doc, "main", "infra", -3, index);
    expect(s.highlighted).toEqual(["a"]); // infra step 0
  });

  it("throws on an unknown scene id, matching resolveStep's own contract", () => {
    expect(() => resolveStepInView(doc, "nope", "default", 0, index)).toThrow(/Unknown scene/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/core`
Expected: FAIL (`Cannot find module '../src/views.js'`)

- [ ] **Step 3: Add `ViewSchema` and `Scene.views` to `src/schema.ts`**

In `packages/core/src/schema.ts`, add `ViewSchema` right after `StepSchema` (before `SceneSchema`):

```ts
export const ViewSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});
```

Change `SceneSchema` to add the optional `views` field (keep every existing field exactly as-is):

```ts
export const SceneSchema = z.strictObject({
  id: z.string().min(1),
  layout: z.literal("two-pane").default("two-pane"),
  text: StepTextSchema.optional(),
  annotations: z.strictObject({
    nodes: z.record(z.string(), z.string()).optional(),
    edges: z.record(z.string(), z.string()).optional(),
  }).optional(),
  steps: z.array(StepSchema).min(1),
  views: z.array(ViewSchema).min(1).optional(),
});
```

Add the inferred type export near the other type exports at the bottom of the file:

```ts
export type View = z.infer<typeof ViewSchema>;
```

- [ ] **Step 4: Implement `src/views.ts`**

```ts
import type { GraphIndex } from "./graph.js";
import type { NarrativeDocument, Scene, Step, View } from "./schema.js";
import { resolveStep } from "./resolve.js";
import type { SceneState } from "./resolve.js";

/**
 * A scene's list of narrative views: an implicit "default" view wrapping the scene's own
 * `steps` (label falls back to the scene title, then "Overview"), followed by any authored
 * `views` in document order. A scene with no `views` produces exactly one entry, so this is
 * always safe to render as a list of choices even when there's nothing to choose between.
 */
export function effectiveSteps(scene: Scene): { id: string; label: string; steps: Step[] }[] {
  const fallback = { id: "default", label: scene.text?.title ?? "Overview", steps: scene.steps };
  return scene.views ? [fallback, ...scene.views] : [fallback];
}

/**
 * Resolves `stepIndex` against a specific view's steps instead of the scene's own top-level
 * `steps` — the one thing that makes lenses work without `resolveStep` itself knowing views
 * exist. Builds a copy of `doc` with the target scene's `steps` swapped to the chosen view's
 * steps, then delegates entirely to the unchanged `resolveStep`.
 *
 * An unknown `viewId` falls back to the default view (mirrors `effectiveSteps`' own fallback,
 * so a stale `activeViewId` after a document edit degrades gracefully instead of erroring).
 * `stepIndex` is clamped to the chosen view's step count: a live UI can briefly hold a
 * `stepIndex` sized for the PREVIOUS view for one render while switching, and clamping avoids
 * that transient mismatch throwing instead of just rendering the view's nearest valid step.
 */
export function resolveStepInView(
  doc: NarrativeDocument,
  sceneId: string,
  viewId: string,
  stepIndex: number,
  index: GraphIndex
): SceneState {
  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  const views = effectiveSteps(scene);
  const view = views.find(v => v.id === viewId) ?? views[0];
  const clampedStepIndex = Math.min(Math.max(stepIndex, 0), view.steps.length - 1);
  const patchedDoc: NarrativeDocument = {
    ...doc,
    scenes: doc.scenes.map(s => (s.id === sceneId ? { ...s, steps: view.steps } : s)),
  };
  return resolveStep(patchedDoc, sceneId, clampedStepIndex, index);
}
```

Add to `src/index.ts`: `export * from "./views.js";`

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w @diascope/core`
Expected: PASS (all `views.test.ts` cases + every pre-existing core test — the `SceneSchema` change is additive/optional so nothing that passed before should break)

- [ ] **Step 6: Build and commit**

```bash
npm run build -w @diascope/core
git add packages/core/src/schema.ts packages/core/src/views.ts packages/core/src/index.ts packages/core/tests/views.test.ts
git commit -m "feat(lens): ViewSchema, Scene.views, effectiveSteps, resolveStepInView"
```

---

### Task 2: `validateDocument` validates every view's steps

**Files:**
- Modify: `packages/core/src/validate.ts`
- Test: `packages/core/tests/validate.test.ts` (additions)

**Context:** Read `packages/core/src/validate.ts` in full before editing (reproduced above in this plan's research — the per-scene loop at the bottom iterates `scene.steps` directly by index, building paths like `scenes[${si}].steps[${ti}]...`). This task extracts that per-step-array validation body into a reusable function called once for `scene.steps` (today's default view — same path shape, so every existing document's error output is byte-identical) and once per authored `scene.views[j]` (path shape `scenes[si].views[vj].steps[ti]...`, where `vj` is the index into `scene.views`, NOT into `effectiveSteps`' prepended list — this keeps the default view's paths exactly as they are today).

- [ ] **Step 1: Write the failing tests** — add to `tests/validate.test.ts` (reuse the file's existing `index` fixture; check the exact fixture name/shape already in the file before writing):

```ts
describe("views", () => {
  const docWithViews = {
    version: 1 as const,
    graph: { source: "g.d2" },
    scenes: [
      {
        id: "main",
        layout: "two-pane" as const,
        steps: [{ id: "s0", camera: { fit: "all" as const } }],
        views: [
          { id: "legal", label: "Legal", steps: [{ id: "l0", focus: ["sys.apo"] }] }, // typo'd id
          { id: "infra", label: "Infra", steps: [{ id: "i0", focus: ["sys.api"] }] }, // valid
        ],
      },
    ],
  };

  it("validates every authored view's steps, with a scenes[i].views[j].steps[k] path for the bad one", () => {
    const { errors } = validateDocument(docWithViews, index);
    const err = errors.find(e => e.reason === "unknown-reference");
    expect(err).toBeDefined();
    expect(err!.path).toBe("scenes[0].views[0].steps[0].focus");
  });

  it("the default view's errors keep today's scenes[i].steps[k] path shape (backward compatible)", () => {
    const withBadDefault = {
      ...docWithViews,
      scenes: [{ ...docWithViews.scenes[0], steps: [{ id: "s0", focus: ["nope"] }] }],
    };
    const { errors } = validateDocument(withBadDefault, index);
    expect(errors.some(e => e.path === "scenes[0].steps[0].focus")).toBe(true);
  });

  it("a document with no views validates identically to before this change", () => {
    const plain = { version: 1 as const, graph: { source: "g.d2" }, scenes: [{ id: "main", layout: "two-pane" as const, steps: [{ id: "s0", camera: { fit: "all" as const } }] }] };
    expect(validateDocument(plain, index)).toEqual({ errors: [], warnings: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/core`
Expected: FAIL (views not yet validated, so the typo'd `sys.apo` in the `legal` view produces no error)

- [ ] **Step 3: Refactor `validateDocument`'s scene loop**

In `packages/core/src/validate.ts`, extract the body of the current `for (let ti = 0; ti < scene.steps.length; ti++) { ... }` loop (everything from `const step = scene.steps[ti];` through the closing brace, including the deferred-verb warning loop) into a new nested function `validateSteps(steps: Step[], stepsPath: string)` that takes the steps array and its path PREFIX (e.g. `"scenes[0].steps"` or `"scenes[0].views[1].steps"`) instead of hardcoding `scenePath`. Inside it, replace every `${stepPath}` built as `` `${scenePath}.steps[${ti}]` `` with `` `${stepsPath}[${ti}]` ``. Then replace the scene loop's step-iteration section with:

```ts
for (let si = 0; si < doc.scenes.length; si++) {
  const scene = doc.scenes[si];
  const scenePath = `scenes[${si}]`;

  // Default view keeps today's scenes[i].steps[...] path shape for backward compatibility;
  // authored views validate independently with scenes[i].views[j].steps[...] paths (j indexes
  // scene.views directly, not effectiveSteps' prepended list, so it matches what the author wrote).
  validateSteps(scene.steps, `${scenePath}.steps`);
  (scene.views ?? []).forEach((view, vi) => {
    validateSteps(view.steps, `${scenePath}.views[${vi}].steps`);
  });

  // annotations.nodes keys must be real node ids. annotations.edges keys match by edge label
  // or "source->target" at render time, not node ids — they aren't validatable here, so skip.
  if (scene.annotations?.nodes) {
    for (const key of Object.keys(scene.annotations.nodes)) {
      resolveOne(key, `${scenePath}.annotations.nodes.${key}`);
    }
  }
}
```

`validateSteps` must be defined (as a function declaration, so it's hoisted and can sit either above or below this loop within `validateDocument`'s body) using the exact same logic the original per-step loop had — every `resolveSelectorVerb`/`validateTrace`/`validatePopover`/deferred-verb-warning call unchanged, just parameterized on `steps`/`stepsPath` instead of closing over `scene.steps`/`scenePath` directly. The `foldVisibility(scene.steps, ti, index, tolerantResolve)` call inside must become `foldVisibility(steps, ti, index, tolerantResolve)` (fold against whichever step array is being validated, not always `scene.steps`).

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @diascope/core`
Expected: PASS (all view tests + every pre-existing validate test, since the default-view path is unchanged)

- [ ] **Step 5: Build and commit**

```bash
npm run build -w @diascope/core
git add packages/core/src/validate.ts packages/core/tests/validate.test.ts
git commit -m "feat(lens): validateDocument validates every authored view's steps"
```

---

### Task 3: Tab row in `NarrativePane`

**Files:**
- Modify: `packages/react/src/NarrativePane.tsx`, `packages/react/src/styles.css`
- Test: `packages/react/tests/two-pane.test.tsx` — actually create a dedicated test file since `NarrativePane` doesn't have its own test file today (component tests for it currently live inside `two-pane.test.tsx`'s integration tests); this task adds direct `NarrativePane` unit tests instead, since the tab row is purely this component's concern.
- Test: `packages/react/tests/narrative-pane.test.tsx` (new)

**Context:** `packages/react/src/NarrativePane.tsx` currently takes `{ scene, stepIndex, onGoto }` and renders a pill row (`scene.steps.map(...)`), title/body, and prev/next. This task adds three new OPTIONAL props — `views`, `activeViewId`, `onLensChange` — rendering a tab row ABOVE the pill row only when `views.length > 1`. Every existing prop/behavior stays unchanged when the new props are omitted (the integration tests inside `two-pane.test.tsx` that already render `NarrativePane` implicitly via `TwoPaneScene` must keep passing unmodified through this task — Task 4 is what actually wires real view data through).

- [ ] **Step 1: Write the failing test** (`tests/narrative-pane.test.tsx`)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Scene } from "@diascope/core";
import { NarrativePane } from "../src/NarrativePane.js";

const scene: Scene = {
  id: "main",
  layout: "two-pane",
  text: { title: "Overview" },
  steps: [{ id: "s0", text: { title: "Step one" } }],
};

describe("NarrativePane", () => {
  it("renders no tab row when views is omitted (unchanged default behavior)", () => {
    const { container } = render(<NarrativePane scene={scene} stepIndex={0} onGoto={vi.fn()} />);
    expect(container.querySelector('[data-diascope-part="lens-tabs"]')).toBeNull();
  });

  it("renders no tab row when only one view exists (nothing to switch between)", () => {
    const { container } = render(
      <NarrativePane
        scene={scene}
        stepIndex={0}
        onGoto={vi.fn()}
        views={[{ id: "default", label: "Overview" }]}
        activeViewId="default"
        onLensChange={vi.fn()}
      />
    );
    expect(container.querySelector('[data-diascope-part="lens-tabs"]')).toBeNull();
  });

  it("renders a tab per view, marks the active one, and calls onLensChange on click", () => {
    const onLensChange = vi.fn();
    const { container, getByText } = render(
      <NarrativePane
        scene={scene}
        stepIndex={0}
        onGoto={vi.fn()}
        views={[{ id: "default", label: "Overview" }, { id: "legal", label: "Legal" }]}
        activeViewId="default"
        onLensChange={onLensChange}
      />
    );
    const tabs = container.querySelector('[data-diascope-part="lens-tabs"]');
    expect(tabs).not.toBeNull();
    const buttons = tabs!.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(getByText("Legal"));
    expect(onLensChange).toHaveBeenCalledWith("legal");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/react`
Expected: FAIL (new test file, no `data-diascope-part="lens-tabs"` exists yet)

- [ ] **Step 3: Edit `src/NarrativePane.tsx`**

```tsx
import type { Scene } from "@diascope/core";

export interface NarrativePaneProps {
  scene: Scene;
  stepIndex: number;
  onGoto: (i: number) => void;
  views?: { id: string; label: string }[];
  activeViewId?: string;
  onLensChange?: (id: string) => void;
}

export function NarrativePane({ scene, stepIndex, onGoto, views, activeViewId, onLensChange }: NarrativePaneProps) {
  const step = scene.steps[stepIndex];
  const title = step.text?.title ?? scene.text?.title ?? "";
  const body = step.text?.body ?? "";

  return (
    <aside data-diascope-part="pane" className="ds-pane">
      {views && views.length > 1 && (
        <nav data-diascope-part="lens-tabs" className="ds-lens-tabs" aria-label="View">
          {views.map(v => (
            <button
              key={v.id}
              type="button"
              className={`ds-lens-tab${v.id === activeViewId ? " ds-lens-tab-active" : ""}`}
              aria-pressed={v.id === activeViewId}
              onClick={() => onLensChange?.(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
      )}
      <nav data-diascope-part="pill-row" className="ds-pills" aria-label="Steps">
        {scene.steps.map((s, i) => (
          <button
            key={s.id ?? i}
            type="button"
            className={`ds-pill${i === stepIndex ? " ds-pill-active" : ""}`}
            aria-current={i === stepIndex ? "step" : undefined}
            title={s.text?.title ?? scene.text?.title ?? undefined}
            onClick={() => onGoto(i)}
          >
            {String(i + 1).padStart(2, "0")}
          </button>
        ))}
      </nav>
      <h2 className="ds-title">{title}</h2>
      <div className="ds-body" dangerouslySetInnerHTML={{ __html: body }} />
      <div className="ds-nav">
        <button type="button" aria-label="Previous step" disabled={stepIndex === 0} onClick={() => onGoto(stepIndex - 1)}>
          ←
        </button>
        <button
          type="button"
          aria-label="Next step"
          disabled={stepIndex === scene.steps.length - 1}
          onClick={() => onGoto(stepIndex + 1)}
        >
          →
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Add CSS** — append to `packages/react/src/styles.css`:

```css
/* --- Lens tabs (audience views) ---------------------------------------------- */
.ds-lens-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.ds-scene .ds-lens-tab {
  border-radius: var(--ds-radius-sm);
  padding: 5px 12px;
  min-height: 28px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--ds-border-strong);
  color: var(--ds-fg-muted);
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}
.ds-scene .ds-lens-tab:hover {
  border-color: rgba(6, 225, 236, 0.6);
}
.ds-scene .ds-lens-tab-active {
  background: rgba(6, 225, 236, 0.14);
  border-color: var(--ds-accent);
  color: #fff;
}
.ds-scene .ds-lens-tab:focus-visible {
  outline: 2px solid var(--ds-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w @diascope/react`
Expected: PASS (all `narrative-pane.test.tsx` cases + every pre-existing react test, since `two-pane.test.tsx`'s `NarrativePane` usage never passes the new props and gets the unchanged no-tab-row behavior)

- [ ] **Step 6: Build and commit**

```bash
npm run build -w @diascope/react
git add packages/react/src/NarrativePane.tsx packages/react/src/styles.css packages/react/tests/narrative-pane.test.tsx
git commit -m "feat(lens): tab row in NarrativePane"
```

---

### Task 4: Wire lens state into `TwoPaneScene`

**Files:**
- Modify: `packages/react/src/TwoPaneScene.tsx`
- Test: `packages/react/tests/two-pane.test.tsx` (additions)

**Context:** Read the current `packages/react/src/TwoPaneScene.tsx` in full before editing — it has grown across the explore-mode sub-project (exploreState, toggle, breadcrumb, etc.) since this plan's research pass. This task adds view-selection state alongside the existing state, computes `state` via `resolveStepInView` instead of `resolveStep` directly, and passes the active view's scene + views/activeViewId/onLensChange to `NarrativePane`.

- [ ] **Step 1: Write the failing tests** — add to `tests/two-pane.test.tsx`, reusing the file's existing `doc`/`svg`/`index` fixtures. First, extend the file's `doc` fixture's scene with a `views` array (check the exact current fixture name/shape — likely still called `doc` — before editing; if the existing `doc` is reused by many other tests, ADD a new sibling fixture `docWithViews` instead of mutating `doc`, to avoid touching unrelated tests):

```tsx
const docWithViews: NarrativeDocument = {
  ...doc,
  scenes: [
    {
      ...doc.scenes[0],
      views: [
        { id: "focused", label: "Focused", steps: [{ id: "f0", focus: ["request"] }] },
      ],
    },
  ],
};

it("renders a tab row and switches the active view + resets to step 0 on tab click", () => {
  const onGoto = vi.fn();
  const { container, getByText } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithViews} sceneId="main" stepIndex={1} onGoto={onGoto} />
  );
  const tabs = container.querySelector('[data-diascope-part="lens-tabs"]');
  expect(tabs).not.toBeNull();
  fireEvent.click(getByText("Focused"));
  expect(onGoto).toHaveBeenCalledWith(0);
});

it("a scene with no views renders no tab row (regression)", () => {
  const { container } = render(<TwoPaneScene svg={svg} index={index} doc={doc} sceneId="main" stepIndex={0} onGoto={vi.fn()} />);
  expect(container.querySelector('[data-diascope-part="lens-tabs"]')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/react`
Expected: FAIL (no `data-diascope-part="lens-tabs"` rendered from `TwoPaneScene` yet)

- [ ] **Step 3: Edit `src/TwoPaneScene.tsx`**

Add the import: `import { effectiveSteps, resolveStepInView } from "@diascope/core";` (add to the existing `@diascope/core` import line rather than a new line — check the current import statement first and merge).

Add state (with the other `useState` calls):

```ts
const [activeViewId, setActiveViewId] = useState("default");
```

Add an effect resetting the active view when the scene changes (with the other `useEffect`s, before the early-return guard):

```ts
useEffect(() => {
  setActiveViewId("default");
}, [sceneId]);
```

Compute the views list (with the other `useMemo`s):

```ts
const views = useMemo(() => (scene ? effectiveSteps(scene) : []), [scene]);
```

Add the lens-change handler (with the other `useCallback`s):

```ts
const onLensChange = useCallback(
  (viewId: string) => {
    setActiveViewId(viewId);
    onGoto(0);
  },
  [onGoto]
);
```

Change the `state` computation from `resolveStep(doc, sceneId, stepIndex, index)` to `resolveStepInView(doc, sceneId, activeViewId, stepIndex, index)` (keep the same `useMemo` wrapper, add `activeViewId` to its dependency array):

```ts
const state = useMemo(
  () => (scene ? resolveStepInView(doc, sceneId, activeViewId, stepIndex, index) : null),
  [doc, scene, sceneId, activeViewId, stepIndex, index]
);
```

In the JSX, change `<NarrativePane scene={scene} stepIndex={stepIndex} onGoto={onGoto} />` to:

```tsx
<NarrativePane
  scene={scene}
  stepIndex={stepIndex}
  onGoto={onGoto}
  views={views.map(v => ({ id: v.id, label: v.label }))}
  activeViewId={activeViewId}
  onLensChange={onLensChange}
/>
```

(Note: `NarrativePane` still receives the unmodified `scene` — its pill row continues to reflect `scene.steps`, i.e. the DEFAULT view's step count/titles, not the active lens's. This is a known v1 simplification: switching to a non-default lens changes the DIAGRAM state via `resolveStepInView` but the pill row's step numbers/titles still describe the default view until Task 5 or a follow-up widens `NarrativePane`'s own `scene` prop to reflect the active view too. Do NOT try to fix this in Task 4 — it's out of this task's scope; the tab-row switching and diagram-state correctness are what Task 4 must prove.)

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @diascope/react`
Expected: PASS (both new tests + every pre-existing test in the package)

- [ ] **Step 5: Build and root test**

```bash
npm run build -w @diascope/react
npm test
```

Expected: clean build, all workspaces green.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/TwoPaneScene.tsx packages/react/tests/two-pane.test.tsx
git commit -m "feat(lens): wire active-view state and resolveStepInView into TwoPaneScene"
```

---

### Task 5: CLI `resolve --view` flag

**Files:**
- Modify: `packages/cli/src/commands/resolve.ts`, `packages/cli/src/index.ts`
- Test: `packages/cli/tests/commands.test.ts` (additions)

**Context:** `packages/cli/src/commands/resolve.ts` currently exports `runResolve(docPath, sceneId, stepIndex): Promise<ResolveReport>`, calling `resolveStep(doc, sceneId, stepIndex, index)` directly. `packages/cli/src/index.ts` wires `resolve <doc> --scene <id> --step <n> [--json]` via commander. Check `packages/cli/tests/commands.test.ts` and its `tests/fixtures/` directory for the exact existing `runResolve` test pattern and fixture file names before writing new tests — reuse them rather than inventing new fixture paths.

- [ ] **Step 1: Write the failing test** — add to `tests/commands.test.ts`. First, create a small fixture with views: `packages/cli/tests/fixtures/views.yaml` and `packages/cli/tests/fixtures/views-graph.d2` (mirror whatever `graph.d2`/`valid.yaml` fixtures already look like in that directory — same node ids so a `focus` selector is valid):

`packages/cli/tests/fixtures/views-graph.d2` (reuse the exact content of the existing `graph.d2` fixture if the directory has one; if not, use):

```d2
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
```

`packages/cli/tests/fixtures/views.yaml`:

```yaml
version: 1
graph:
  source: ./views-graph.d2
scenes:
  - id: main
    steps:
      - id: s0
        camera: { fit: all }
    views:
      - id: legal
        label: Legal
        steps:
          - id: l0
            focus: [sys.api]
```

```ts
it("runResolve defaults to the 'default' view", async () => {
  const { state } = await runResolve(fixturePath("views.yaml"), "main", 0);
  expect(state.cameraFit.length).toBeGreaterThan(0); // fit:all resolves to every visible node
});

it("runResolve resolves against an explicit --view", async () => {
  const { state } = await runResolve(fixturePath("views.yaml"), "main", 0, "legal");
  expect(state.highlighted).toEqual(["sys.api"]);
});
```

(Use whatever `fixturePath(...)` or equivalent path-joining helper the existing tests in this file already use — check first, don't invent a different one.)

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/cli`
Expected: FAIL (`runResolve` doesn't accept a 4th argument yet, or the fixture files don't exist)

- [ ] **Step 3: Edit `src/commands/resolve.ts`**

```ts
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDocument, resolveStepInView, type SceneState } from "@diascope/core";
import { WasmD2Compiler } from "@diascope/d2";
import { toReadableD2Error } from "../d2-error.js";

export interface ResolveReport {
  state: SceneState;
  graphPath: string;
}

/**
 * Loads a narrative document + its compiled D2 graph (same path resolution as
 * runValidate) and computes the SceneState for one scene+step+view via @diascope/core's
 * resolveStepInView. Lets an agent preview exactly what the renderer would show for a given
 * step (and lens) without spinning up the deck. `viewId` defaults to "default" — a document
 * with no `views` on the scene always resolves that scene's own top-level steps.
 */
export async function runResolve(
  docPath: string,
  sceneId: string,
  stepIndex: number,
  viewId = "default"
): Promise<ResolveReport> {
  const doc = loadDocument(await readFile(docPath, "utf8"));
  const graphPath = resolve(dirname(docPath), doc.graph.source);
  try {
    await access(graphPath);
  } catch {
    throw new Error(`Graph source not found: ${graphPath} (referenced by ${docPath} as "${doc.graph.source}")`);
  }
  let index;
  try {
    ({ index } = await new WasmD2Compiler().compile(await readFile(graphPath, "utf8")));
  } catch (e) {
    throw toReadableD2Error(e);
  }
  const state = resolveStepInView(doc, sceneId, viewId, stepIndex, index);
  return { state, graphPath };
}
```

- [ ] **Step 4: Wire the `--view` flag in `src/index.ts`**

In the `resolve` command's `.action(...)` handler in `packages/cli/src/index.ts`, add a `--view <id>` option (default `"default"`) and pass it through:

```ts
program
  .command("resolve <doc>")
  .description("Print the computed SceneState (visible/highlighted/dimmed/traced/popovers/cameraFit/text) for a scene+step")
  .requiredOption("--scene <id>", "scene id")
  .requiredOption("--step <n>", "step index (0-based)", (v: string) => parseInt(v, 10))
  .option("--view <id>", "view/lens id (defaults to the scene's own steps)", "default")
  .option("--json", "machine-readable output")
  .action(async (doc: string, opts: { scene: string; step: number; view: string; json?: boolean }) => {
    try {
      const { state, graphPath } = await runResolve(doc, opts.scene, opts.step, opts.view);
      if (opts.json) {
        console.log(JSON.stringify({ ...state, graphPath }, null, 2));
      } else {
        console.log(`scene:       ${opts.scene}`);
        console.log(`view:        ${opts.view}`);
        console.log(`step:        ${opts.step}`);
        console.log(`visible:     ${state.visible.join(", ") || "(none)"}`);
        console.log(`highlighted: ${state.highlighted.join(", ") || "(none)"}`);
        console.log(`dimmed:      ${state.dimmed.join(", ") || "(none)"}`);
        console.log(
          `traced:      ${state.traced.length ? state.traced.map(e => `${e.source} -> ${e.target}`).join(", ") : "(none)"}`
        );
        console.log(
          `popovers:    ${state.popovers.length ? state.popovers.map(p => `${p.target}: "${p.content}"`).join("; ") : "(none)"}`
        );
        console.log(`cameraFit:   ${state.cameraFit.join(", ") || "(none)"}`);
        console.log(`text.title:  ${state.text?.title ?? "(none)"}`);
        console.log(`text.body:   ${state.text?.body ?? "(none)"}`);
      }
      process.exitCode = 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (opts.json) console.log(JSON.stringify({ error: msg }, null, 2));
      else console.error(`fatal: ${msg}`);
      process.exitCode = 2;
    }
  });
```

(Only the `.option("--view <id>", ...)` line, the handler's opts type, the `runResolve(...)` call's 4th argument, and the added `view:` print line are new — every other line of this command block is unchanged from what's already in the file; replace the whole block to be safe rather than hand-patching.)

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w @diascope/cli`
Expected: PASS (new tests + every pre-existing cli test)

- [ ] **Step 6: Build and smoke-test the bin**

```bash
npm run build -w @diascope/cli
node packages/cli/dist/index.js resolve packages/cli/tests/fixtures/views.yaml --scene main --step 0 --view legal --json
```

Expected: JSON output with `"highlighted": ["sys.api"]`.

- [ ] **Step 7: Root test and commit**

```bash
npm test
git add packages/cli/src/commands/resolve.ts packages/cli/src/index.ts packages/cli/tests/commands.test.ts packages/cli/tests/fixtures/views.yaml packages/cli/tests/fixtures/views-graph.d2
git commit -m "feat(lens): CLI resolve --view flag"
```

---

### Task 6: Browser verification

**Files:**
- Create: `demo/deck/public/stories/lens-test/diagram.d2`, `demo/deck/public/stories/lens-test/story.yaml`
- Modify: `demo/deck/tests/layout.spec.ts`

**Context:** Read `demo/deck/tests/layout.spec.ts` in full first — confirm current exact helper names (`layout()`, `assertInvariants`, `settle`, `url`/`STORY` env wiring) before writing new code, they've evolved across prior sub-projects. Ports 5173/5174/4173/5199-5230 may have stale processes (`kill` denied) — start a fresh dev server on an unused port if needed (`npm run dev -w diascope-demo-deck -- --port 5240 --strictPort`, backgrounded) rather than fighting a stale one.

- [ ] **Step 1: Author a minimal test story with two views**, validated clean with the CLI before proceeding:

`demo/deck/public/stories/lens-test/diagram.d2`:

```d2
producer: Producer { class: entry }
queue: Queue { class: svc }
consumer: Consumer { class: entry }
producer -> queue: publish
queue -> consumer: deliver
```

`demo/deck/public/stories/lens-test/story.yaml`:

```yaml
version: 1
graph:
  source: ./diagram.d2
scenes:
  - id: main
    text: { title: "Message flow" }
    steps:
      - id: overview
        camera: { fit: all }
        text: { title: "Overview", body: "The default, unfiltered narrative." }
    views:
      - id: ops
        label: "Ops"
        steps:
          - id: ops-0
            focus: [queue]
            text: { title: "Ops lens", body: "Operators care about queue health." }
      - id: dev
        label: "Dev"
        steps:
          - id: dev-0
            focus: [producer, queue, consumer]
            trace: "producer->queue"
            text: { title: "Dev lens", body: "Developers care about the full call path." }
```

Validate: `node packages/cli/dist/index.js validate demo/deck/public/stories/lens-test/story.yaml --json` must report `"valid": true, "errors": [], "warnings": []` (build the CLI first: `npm run build -w @diascope/cli` if `dist/` is stale). Fix the yaml if it doesn't validate clean before proceeding.

- [ ] **Step 2: Add a Playwright test** to `demo/deck/tests/layout.spec.ts`:

```ts
test("audience lenses: tab row switches views and resets to step 0, no console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto("/?story=lens-test");
  await page.waitForFunction(() => (window as any).deck?.isReady());
  await page.waitForSelector('[data-diascope-part="canvas"] svg', { timeout: 30_000 });
  await settle(page);

  const tabs = page.locator('[data-diascope-part="lens-tabs"] button');
  await expect(tabs).toHaveCount(3); // default + ops + dev

  await tabs.nth(1).click(); // "Ops"
  await settle(page);
  await assertInvariants(page, "lens: ops view active");
  await page.screenshot({ path: `screens/lens-01-ops.png` });

  await tabs.nth(2).click(); // "Dev"
  await settle(page);
  await assertInvariants(page, "lens: dev view active");
  await page.screenshot({ path: `screens/lens-02-dev.png` });

  expect(errors, `console/page errors during lens switch: ${errors.join("\n")}`).toEqual([]);
});
```

(Adapt `assertInvariants`/`settle` calls to the file's actual current signatures if they differ from this sketch — read the file first per the task context note.)

- [ ] **Step 3: Run against the new story**

```bash
STORY=lens-test npx playwright test --project=desktop -g "audience lenses"
```

Expected: pass, zero console errors.

- [ ] **Step 4: Run the full existing suite** to confirm zero regression from Tasks 3-4's `NarrativePane`/`TwoPaneScene` changes

```bash
npx playwright test --project=desktop
npx playwright test --project=narrow
```

Expected: all pass (proves the no-views default path is visually unchanged).

- [ ] **Step 5: Look at the two screenshots.** Confirm the tab row reads clearly, doesn't overlap the pill row or drawer/popover chrome, and the diagram correctly re-fits between lenses. Fix CSS if anything looks wrong (adjust `.ds-lens-tabs`/`.ds-lens-tab` in `packages/react/src/styles.css`, rebuild `@diascope/react`, re-run) rather than just reporting it.

- [ ] **Step 6: Commit**

```bash
git add demo/deck/public/stories/lens-test demo/deck/tests/layout.spec.ts
git commit -m "test(lens): playwright verification for audience-lens switching"
```

(If Step 5 required a CSS fix, commit it separately: `git add packages/react/src/styles.css && git commit -m "fix(lens): <what you fixed>"`.)

---

## Self-review notes

- **Spec coverage:** schema addition (Task 1), `effectiveSteps` (Task 1), validation per-view (Task 2), tab row UI (Task 3), `resolveStepInView`-driven resolution + reset-to-step-0 on switch (Task 4), CLI `--view` flag (Task 5), backward compatibility (every task's regression test), browser verification (Task 6) — all covered.
- **Design refinement flagged up top:** `resolveStepInView` moved from the spec's suggested `@diascope/react` location into `@diascope/core`, since both `TwoPaneScene` (Task 4) and the CLI (Task 5) need identical logic and the CLI cannot depend on `@diascope/react`.
- **Known v1 limitation, explicitly called out in Task 4** (not silently left implicit): the pill row's step count/titles still reflect the scene's default `steps`, not the active lens's steps, even while the diagram itself correctly reflects the active lens. Fully unifying this would mean also passing a view-patched `Scene` into `NarrativePane` for its pill row — left as a fast-follow rather than expanding this plan, since the tab-row switching and diagram correctness (the feature's core value) are fully proven by Task 6's browser test.
- **Type consistency:** `resolveStepInView(doc, sceneId, viewId, stepIndex, index)` signature is identical across its Task 1 definition, Task 4's `TwoPaneScene` call, and Task 5's CLI call. `effectiveSteps(scene): { id, label, steps }[]` return shape matches every consumer (Task 3's `views` prop shape, Task 4's `.map(v => ({id, label}))`).
