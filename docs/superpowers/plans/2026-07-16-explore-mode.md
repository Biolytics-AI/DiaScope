# Explore Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let viewers break away from the authored narration to explore the diagram themselves — click a leaf node to isolate its neighborhood, click a container to drill into its children — then return to exactly the step they left.

**Architecture:** A pure function `applyExploreOverlay(authored, explore, index) → SceneState` in `@diascope/react` replaces the rendered state with a neutral full-diagram view while explore mode is active, computed from click targets instead of authored selectors. It never touches the document or `resolveStep`, so exit is instant identity restoration. `GraphCanvas`, `state-classes.ts`, `camera.ts`, and `PopoverLayer` need zero changes — they already just render whatever `SceneState` they're handed.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-16-explore-mode-design.md` — read it first.

---

## Conventions

- Branch `feat/diascope-v2-design` (already checked out — verify with `git branch --show-current`, don't switch).
- Build order: `npm run build -w @diascope/core && npm run build -w @diascope/d2 && npm run build -w @diascope/react` before any test run that touches built dist.
- Explicit-path `git add` (never `-A`) — there are pre-existing untracked review-probe files in the repo (`packages/core/tests/zzz-probe.test.ts`, `packages/d2/probe-*.mjs`, `*.tsbuildinfo`); leave them alone, don't stage them.
- `rm`/`kill` are permission-denied this session for everyone — never attempt them; if you need to discard a scratch file, `mv` it to the scratchpad directory instead.
- Don't touch `packages/diascope` (the legacy package).
- Commit after every task, message prefix `feat(explore):`, `test(explore):`, or `fix(explore):`.

---

### Task 1: `explore.ts` — pure overlay module

**Files:**
- Create: `packages/react/src/explore.ts`
- Modify: `packages/react/src/index.ts` (add `export * from "./explore.js";`)
- Test: `packages/react/tests/explore.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/explore.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import type { GraphIndex, SceneState } from "@diascope/core";
import {
  applyExploreOverlay,
  nextExploreTarget,
  drillBreadcrumb,
  INACTIVE_EXPLORE_STATE,
  type ExploreState,
} from "../src/explore.js";

const index: GraphIndex = {
  nodes: [
    { id: "sys", label: "System", classes: [], parent: null },
    { id: "sys.api", label: "API", classes: ["svc"], parent: "sys" },
    { id: "sys.db", label: "DB", classes: ["db"], parent: "sys" },
    { id: "request", label: "Request", classes: ["entry"], parent: null },
    { id: "lonely", label: "Lonely", classes: [], parent: null },
  ],
  edges: [
    { id: "(request -> sys.api)[0]", source: "request", target: "sys.api" },
    { id: "(sys.api -> sys.db)[0]", source: "sys.api", target: "sys.db" },
  ],
};

const authoredState: SceneState = {
  visible: ["sys", "sys.api", "sys.db", "request", "lonely"],
  highlighted: ["request"],
  dimmed: ["sys", "sys.db", "lonely"],
  traced: [],
  popovers: [{ target: "request", content: "hi" }],
  cameraFit: ["request"],
  text: { title: "Step title" },
};

describe("applyExploreOverlay", () => {
  it("inactive returns the authored state unchanged (identity)", () => {
    expect(applyExploreOverlay(authoredState, INACTIVE_EXPLORE_STATE, index)).toBe(authoredState);
  });

  it("active with no target: neutral base, all visible, nothing dimmed, camera fits all, keeps step text", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: null }, index);
    expect(s.visible.slice().sort()).toEqual(["lonely", "request", "sys", "sys.api", "sys.db"]);
    expect(s.highlighted).toEqual([]);
    expect(s.dimmed).toEqual([]);
    expect(s.popovers).toEqual([]);
    expect(s.cameraFit.slice().sort()).toEqual(["lonely", "request", "sys", "sys.api", "sys.db"]);
    expect(s.text).toEqual({ title: "Step title" });
  });

  it("isolate: highlights the node + neighbors, dims the rest, traces the connecting edges", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "isolate", nodeId: "sys.api" } }, index);
    expect(s.highlighted.slice().sort()).toEqual(["request", "sys.api", "sys.db"]);
    expect(s.dimmed.slice().sort()).toEqual(["lonely", "sys"]);
    expect(s.traced.map(e => e.id).slice().sort()).toEqual(["(request -> sys.api)[0]", "(sys.api -> sys.db)[0]"]);
    expect(s.cameraFit.slice().sort()).toEqual(["request", "sys.api", "sys.db"]);
  });

  it("isolate on a node with zero edges highlights only itself", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "isolate", nodeId: "lonely" } }, index);
    expect(s.highlighted).toEqual(["lonely"]);
    expect(s.traced).toEqual([]);
    expect(s.cameraFit).toEqual(["lonely"]);
  });

  it("drill: highlights the container + its children, dims the rest without hiding it", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "drill", containerId: "sys" } }, index);
    expect(s.highlighted.slice().sort()).toEqual(["sys", "sys.api", "sys.db"]);
    expect(s.dimmed.slice().sort()).toEqual(["lonely", "request"]);
    expect(s.visible.slice().sort()).toEqual(["lonely", "request", "sys", "sys.api", "sys.db"]);
    expect(s.cameraFit.slice().sort()).toEqual(["sys", "sys.api", "sys.db"]);
  });

  it("drilling into a childless id degrades to isolating it", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "drill", containerId: "lonely" } }, index);
    expect(s.highlighted).toEqual(["lonely"]);
  });
});

describe("nextExploreTarget", () => {
  it("clicking a leaf isolates it", () => {
    expect(nextExploreTarget("request", null, index)).toEqual({ kind: "isolate", nodeId: "request" });
  });
  it("clicking a container drills into it", () => {
    expect(nextExploreTarget("sys", null, index)).toEqual({ kind: "drill", containerId: "sys" });
  });
  it("clicking the currently-drilled container again zooms back out", () => {
    expect(nextExploreTarget("sys", { kind: "drill", containerId: "sys" }, index)).toBeNull();
  });
  it("clicking the currently-isolated node again is a no-op", () => {
    const current: ExploreState["target"] = { kind: "isolate", nodeId: "request" };
    expect(nextExploreTarget("request", current, index)).toBe(current);
  });
  it("clicking an unrelated container while mid-drill replaces the target", () => {
    expect(nextExploreTarget("sys", { kind: "isolate", nodeId: "request" }, index)).toEqual({ kind: "drill", containerId: "sys" });
  });
});

describe("drillBreadcrumb", () => {
  it("root container: single-element chain", () => {
    expect(drillBreadcrumb("sys", index)).toEqual(["sys"]);
  });
  it("nested container: root-to-leaf ancestor chain", () => {
    expect(drillBreadcrumb("sys.api", index)).toEqual(["sys", "sys.api"]);
  });
  it("unknown id: empty array", () => {
    expect(drillBreadcrumb("nope", index)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/react`
Expected: FAIL (`Cannot find module '../src/explore.js'`)

- [ ] **Step 3: Implement `src/explore.ts`**

```ts
import type { GraphEdge, GraphIndex, SceneState } from "@diascope/core";

export type ExploreTarget = { kind: "isolate"; nodeId: string } | { kind: "drill"; containerId: string };

export interface ExploreState {
  active: boolean;
  target: ExploreTarget | null;
}

export const INACTIVE_EXPLORE_STATE: ExploreState = { active: false, target: null };

function childrenOf(containerId: string, index: GraphIndex): string[] {
  return index.nodes.filter(n => n.parent === containerId).map(n => n.id);
}

function neighborsOf(nodeId: string, index: GraphIndex): { ids: string[]; edges: GraphEdge[] } {
  const edges = index.edges.filter(e => e.source === nodeId || e.target === nodeId);
  const ids = edges.map(e => (e.source === nodeId ? e.target : e.source));
  return { ids, edges };
}

/**
 * Replaces the rendered SceneState with a neutral, fully-visible view while explore mode is
 * active, computed from the click target instead of authored selectors. Never reads the
 * authored visible/dim/cameraFit — entering explore mode means seeing the whole diagram, not
 * exploring through whatever the current step chose to hide. Identity when inactive, so exit
 * is instant and exactly restores the step you were on.
 */
export function applyExploreOverlay(authored: SceneState, explore: ExploreState, index: GraphIndex): SceneState {
  if (!explore.active) return authored;

  const allIds = index.nodes.map(n => n.id);
  const base: SceneState = {
    visible: allIds,
    highlighted: [],
    dimmed: [],
    traced: [],
    popovers: [],
    cameraFit: allIds,
    text: authored.text,
  };

  if (!explore.target) return base;

  if (explore.target.kind === "isolate") {
    const { ids: neighborIds, edges } = neighborsOf(explore.target.nodeId, index);
    const highlighted = [explore.target.nodeId, ...neighborIds];
    return {
      ...base,
      highlighted,
      dimmed: allIds.filter(id => !highlighted.includes(id)),
      traced: edges,
      cameraFit: highlighted,
    };
  }

  const children = childrenOf(explore.target.containerId, index);
  if (children.length === 0) {
    return applyExploreOverlay(
      authored,
      { active: true, target: { kind: "isolate", nodeId: explore.target.containerId } },
      index
    );
  }
  const highlighted = [explore.target.containerId, ...children];
  return {
    ...base,
    highlighted,
    dimmed: allIds.filter(id => !highlighted.includes(id)),
    cameraFit: highlighted,
  };
}

/** Classifies a click: nodes with children in `index` drill, everything else isolates.
 *  Re-clicking the current drill target zooms back out (null); re-clicking the current
 *  isolate target is a no-op; anything else replaces the current target. */
export function nextExploreTarget(clickedId: string, current: ExploreTarget | null, index: GraphIndex): ExploreTarget | null {
  const isContainer = index.nodes.some(n => n.parent === clickedId);
  if (isContainer) {
    if (current?.kind === "drill" && current.containerId === clickedId) return null;
    return { kind: "drill", containerId: clickedId };
  }
  if (current?.kind === "isolate" && current.nodeId === clickedId) return current;
  return { kind: "isolate", nodeId: clickedId };
}

/** Root-to-leaf ancestor chain for breadcrumb rendering, derived from the index's parent
 *  links (no manually-tracked drill history needed). Empty for an id not in the index. */
export function drillBreadcrumb(containerId: string, index: GraphIndex): string[] {
  if (!index.nodes.some(n => n.id === containerId)) return [];
  const chain: string[] = [];
  let cur: string | null = containerId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    cur = index.nodes.find(n => n.id === cur)?.parent ?? null;
  }
  return chain;
}
```

Add to `src/index.ts`: `export * from "./explore.js";`

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @diascope/react`
Expected: PASS (all `explore.test.ts` cases + all pre-existing react tests)

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/explore.ts packages/react/src/index.ts packages/react/tests/explore.test.ts
git commit -m "feat(explore): pure isolate/drill overlay module"
```

---

### Task 2: Wire explore state + click routing into `TwoPaneScene`

**Files:**
- Modify: `packages/react/src/TwoPaneScene.tsx`
- Test: `packages/react/tests/two-pane.test.tsx` (additions)

**Context:** Read the current `packages/react/src/TwoPaneScene.tsx` in full before editing — it owns `binding`/`drawer`/`tooltip`/`containerSize` state, a `scene`/`state` pair computed via `resolveStep` (both possibly null, guarded by an early-return `scene-error` render so all hooks stay unconditional), an `onNodeClick` callback that currently only opens the drawer for annotated nodes, and an `interactiveNodeIds` memo currently scoped to annotated-node ids only. This task adds explore state alongside the existing state, branches `onNodeClick` on it, widens `interactiveNodeIds` while exploring, auto-exits on step change, and passes the exploreoverlay-derived state to `GraphCanvas` instead of the raw authored state (this is what makes the camera actually pan/zoom into the isolate/drill target — `GraphCanvas` already re-fits its camera from whatever `state` prop it's given, so no `GraphCanvas` change is needed).

- [ ] **Step 1: Write the failing tests** — add to `tests/two-pane.test.tsx` (reuse the file's existing compiled-svg/index fixtures from its `beforeAll`; adapt the exact doc/scene fixture names to what's already in the file):

```tsx
it("leaf click while not exploring still opens the drawer for an annotated node (regression)", async () => {
  const { container } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={0} onGoto={() => {}} />
  );
  fireEvent.click(container.querySelector('[data-diascope-id="sys.api"] path, [data-diascope-id="sys.api"] text, [data-diascope-id="sys.api"]')!);
  expect(container.querySelector('[data-diascope-part="drawer"]')).toBeTruthy();
});

it("toggling explore on renders the toggle as pressed and hides the drawer/popover path", () => {
  const { getByRole } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={1} onGoto={() => {}} />
  );
  const toggle = getByRole("button", { name: /explore/i });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");
});

it("leaf click while exploring isolates instead of opening the drawer, even for an annotated node", () => {
  const { container, getByRole } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={0} onGoto={() => {}} />
  );
  fireEvent.click(getByRole("button", { name: /explore/i }));
  const sysApiEl = container.querySelector('[data-diascope-id="sys.api"]')!;
  fireEvent.click(sysApiEl);
  expect(container.querySelector('[data-diascope-part="drawer"]')).toBeFalsy();
  expect(sysApiEl.getAttribute("class")).toContain("ds-highlight");
});

it("a stepIndex change while exploring auto-exits explore mode", () => {
  const { getByRole, rerender } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={0} onGoto={() => {}} />
  );
  fireEvent.click(getByRole("button", { name: /explore/i }));
  expect(getByRole("button", { name: /explore/i })).toHaveAttribute("aria-pressed", "true");
  rerender(<TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={1} onGoto={() => {}} />);
  expect(getByRole("button", { name: /explore/i })).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/react`
Expected: FAIL (no `role="button" name=/explore/i` exists yet)

- [ ] **Step 3: Edit `src/TwoPaneScene.tsx`**

Add the import:

```ts
import {
  applyExploreOverlay,
  nextExploreTarget,
  INACTIVE_EXPLORE_STATE,
  type ExploreState,
} from "./explore.js";
```

Add explore state alongside the existing `useState` calls:

```ts
const [exploreState, setExploreState] = useState<ExploreState>(INACTIVE_EXPLORE_STATE);
const isFirstStepRenderRef = useRef(true);
```

Add an auto-exit effect (placed with the other `useEffect`s, before the early-return guard so it stays unconditional):

```ts
useEffect(() => {
  if (isFirstStepRenderRef.current) {
    isFirstStepRenderRef.current = false;
    return;
  }
  setExploreState(INACTIVE_EXPLORE_STATE);
}, [stepIndex]);
```

Add an Escape-to-exit effect (separate from the existing drawer Escape effect — the two are mutually exclusive since explore mode routes clicks away from `setDrawer`):

```ts
useEffect(() => {
  if (!exploreState.active) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setExploreState(INACTIVE_EXPLORE_STATE);
    }
  };
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}, [exploreState.active]);
```

Replace the existing `onNodeClick`:

```ts
const onNodeClick = useCallback(
  (id: string) => {
    if (exploreState.active) {
      setExploreState(prev => ({ active: true, target: nextExploreTarget(id, prev.target, index) }));
      return;
    }
    if (scene?.annotations?.nodes?.[id]) setDrawer(id);
  },
  [exploreState.active, scene, index]
);
```

Replace the existing `interactiveNodeIds` memo:

```ts
const interactiveNodeIds = useMemo(
  () => (exploreState.active ? index.nodes.map(n => n.id) : Object.keys(scene?.annotations?.nodes ?? {})),
  [exploreState.active, index, scene]
);
```

Change the popover-render condition from `{!drawer && (` to `{!drawer && !exploreState.active && (`.

After the existing `if (!scene || !state) { return (...scene-error...); }` guard (i.e. in the branch where `state` is narrowed non-null), add:

```ts
const renderedState = applyExploreOverlay(state, exploreState, index);
```

and change the `<GraphCanvas>` call's `state={state}` prop to `state={renderedState}`.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @diascope/react`
Expected: PASS (all four new tests + every pre-existing test in the package)

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/TwoPaneScene.tsx packages/react/tests/two-pane.test.tsx
git commit -m "feat(explore): wire explore state, click routing, and auto-exit into TwoPaneScene"
```

---

### Task 3: Explore toggle + breadcrumb UI

**Files:**
- Modify: `packages/react/src/TwoPaneScene.tsx`, `packages/react/src/styles.css`
- Test: `packages/react/tests/two-pane.test.tsx` (additions)

**Context:** This task adds the actual toggle button and container-drill breadcrumb Task 2's tests already assert exist (`getByRole("button", { name: /explore/i })`). It builds on Task 2's `exploreState`/`setExploreState`.

- [ ] **Step 1: Write the failing tests** — add to `tests/two-pane.test.tsx`:

```tsx
it("clicking a container while exploring drills into it and shows a breadcrumb", () => {
  const { container, getByRole, getByText } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={0} onGoto={() => {}} />
  );
  fireEvent.click(getByRole("button", { name: /explore/i }));
  fireEvent.click(container.querySelector('[data-diascope-id="sys"]')!);
  expect(container.querySelector('[data-diascope-part="drill-breadcrumb"]')).toBeTruthy();
  expect(getByText("System")).toBeTruthy(); // sys's label, as a breadcrumb crumb
});

it("clicking the drilled container's own breadcrumb crumb keeps the same drill target", () => {
  const { container, getByRole } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={0} onGoto={() => {}} />
  );
  fireEvent.click(getByRole("button", { name: /explore/i }));
  fireEvent.click(container.querySelector('[data-diascope-id="sys"]')!);
  const crumb = container.querySelector('[data-diascope-part="drill-breadcrumb"] button')!;
  fireEvent.click(crumb);
  expect(container.querySelector('[data-diascope-id="sys"]')?.getAttribute("class")).toContain("ds-highlight");
});

it("the explore toggle exits explore mode when clicked again", () => {
  const { getByRole } = render(
    <TwoPaneScene svg={svg} index={index} doc={docWithAnnotations} sceneId="main" stepIndex={0} onGoto={() => {}} />
  );
  const toggle = getByRole("button", { name: /explore/i });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/react`
Expected: FAIL (no toggle/breadcrumb markup exists yet)

- [ ] **Step 3: Add the JSX** inside `.ds-canvas-wrap` in `src/TwoPaneScene.tsx`, alongside the existing `PopoverLayer`/tooltip/drawer children (add the `drillBreadcrumb` import to the Task 2 import line):

```ts
import {
  applyExploreOverlay,
  nextExploreTarget,
  drillBreadcrumb,
  INACTIVE_EXPLORE_STATE,
  type ExploreState,
} from "./explore.js";
```

```tsx
<div className="ds-explore-controls">
  <button
    type="button"
    className="ds-explore-toggle"
    aria-pressed={exploreState.active}
    onClick={() =>
      setExploreState(prev => (prev.active ? INACTIVE_EXPLORE_STATE : { active: true, target: null }))
    }
  >
    {exploreState.active ? "Exploring · Exit" : "Explore"}
  </button>
  {exploreState.active && exploreState.target?.kind === "drill" && (
    <nav data-diascope-part="drill-breadcrumb" className="ds-explore-breadcrumb" aria-label="Container path">
      {drillBreadcrumb(exploreState.target.containerId, index).map((id, i, arr) => (
        <button
          key={id}
          type="button"
          className="ds-explore-crumb"
          onClick={() => setExploreState({ active: true, target: { kind: "drill", containerId: id } })}
        >
          {(index.nodes.find(n => n.id === id)?.label ?? id) + (i < arr.length - 1 ? " ›" : "")}
        </button>
      ))}
    </nav>
  )}
</div>
```

- [ ] **Step 4: Add CSS** — append to `src/styles.css`:

```css
/* --- Explore mode: toggle + drill breadcrumb -------------------------------- */
.ds-explore-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.ds-explore-toggle {
  background: var(--ds-surface);
  border: 1px solid var(--ds-border-strong);
  color: var(--ds-fg-muted);
  border-radius: var(--ds-radius-sm);
  padding: 6px 12px;
  min-height: 32px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.ds-explore-toggle:hover {
  border-color: rgba(6, 225, 236, 0.6);
}
.ds-explore-toggle[aria-pressed="true"] {
  background: rgba(6, 225, 236, 0.14);
  border-color: var(--ds-accent);
  color: #fff;
}
.ds-explore-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  max-width: 260px;
}
.ds-explore-crumb {
  background: var(--ds-surface);
  border: 1px solid var(--ds-border-strong);
  color: var(--ds-fg-muted);
  border-radius: 999px;
  padding: 3px 10px;
  min-height: 24px;
  font-size: 11px;
  cursor: pointer;
}
.ds-explore-crumb:hover {
  border-color: rgba(6, 225, 236, 0.6);
}
.ds-explore-toggle:focus-visible,
.ds-explore-crumb:focus-visible {
  outline: 2px solid var(--ds-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w @diascope/react`
Expected: PASS (all new tests + full package suite)

- [ ] **Step 6: Build and visually sanity-check**

Run: `npm run build -w @diascope/react`
Expected: clean `tsc` compile + `styles.css` copied to `dist/`

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/TwoPaneScene.tsx packages/react/src/styles.css packages/react/tests/two-pane.test.tsx
git commit -m "feat(explore): toggle button and drill breadcrumb UI"
```

---

### Task 4: Browser verification (Playwright)

**Files:**
- Modify: `demo/deck/tests/layout.spec.ts`

**Context:** Read the current file in full first — it has evolved across several fix rounds (story-agnostic drawer test, stacked-layout invariant, etc.) and its exact helper names (`layout()`, `assertInvariants`, `settle()`, `clickNode`) may differ slightly from what's described here; adapt to what's actually there rather than assuming. The dev server situation: ports 5173/5174/4173/5199-5215 may have stale processes from prior sessions (`kill` is permission-denied) — start a fresh server on an unused port (`npm run dev -w diascope-demo-deck -- --port 5220 --strictPort`, backgrounded) rather than fighting a stale one, and point Playwright at it if the config's default port is occupied by something unrelated.

- [ ] **Step 1: Add a new test** to `demo/deck/tests/layout.spec.ts` (adapt helper names to match the file):

```ts
test("explore mode: isolate, drill, breadcrumb, and exit produce no console errors and stay within the canvas", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto(url);
  await page.waitForFunction(() => (window as any).deck?.isReady());
  await page.waitForSelector('[data-diascope-part="canvas"] svg', { timeout: 30_000 });
  await settle(page);

  const toggle = page.getByRole("button", { name: /explore/i }).first();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await settle(page);
  await assertInvariants(page, "explore: entered, no target");
  await page.screenshot({ path: `screens/explore-01-entered.png` });

  // Click any node with geometry to isolate or drill it — whichever the compiled diagram
  // resolves to first is fine; the invariant check doesn't care which.
  const anyNode = page.locator('[data-diascope-part="canvas"] [data-diascope-id]').first();
  await anyNode.click({ force: true });
  await settle(page);
  await assertInvariants(page, "explore: node clicked");
  await page.screenshot({ path: `screens/explore-02-target.png` });

  const breadcrumb = page.locator('[data-diascope-part="drill-breadcrumb"]');
  if (await breadcrumb.count()) {
    const crumbs = breadcrumb.locator("button");
    expect(await crumbs.count()).toBeGreaterThan(0);
    const crumbBox = await breadcrumb.boundingBox();
    const canvasBox = await page.locator('[data-diascope-part="canvas"]').boundingBox();
    if (crumbBox && canvasBox) {
      expect(crumbBox.x).toBeGreaterThanOrEqual(canvasBox.x - 4);
      expect(crumbBox.x + crumbBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 4);
    }
  }

  await page.keyboard.press("Escape");
  await settle(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await assertInvariants(page, "explore: exited via Escape");

  expect(errors, `console/page errors during explore walk: ${errors.join("\n")}`).toEqual([]);
});
```

- [ ] **Step 2: Extend `assertInvariants`** (or add inline assertions in the new test, whichever matches the file's existing structure) so that whenever explore mode is active, the `popover` and `drawer` parts from `window.__diascopeDebug.layout()` are absent:

```ts
const enriched = await page.evaluate(() =>
  (window as any).__diascopeDebug?.layout().some((e: any) => e.part === "popover" || e.part === "drawer")
);
expect(enriched, `${label}: popover/drawer must be suppressed while exploring`).toBe(false);
```

(Insert this check only inside the explore-mode test above, gated on the toggle's `aria-pressed="true"` state — do not add it to the general `assertInvariants` used by non-explore tests.)

- [ ] **Step 3: Run against the default story and both agent stories**

```bash
npx playwright test --project=desktop -g "explore mode"
STORY=c2f-flow npx playwright test --project=desktop -g "explore mode"
```

Expected: both pass, zero console errors reported.

- [ ] **Step 4: Run the full existing suite** to confirm no regression

```bash
npx playwright test --project=desktop
npx playwright test --project=narrow
```

Expected: all pass (this and prior tasks didn't change any non-explore rendering path).

- [ ] **Step 5: Commit**

```bash
git add demo/deck/tests/layout.spec.ts
git commit -m "test(explore): playwright verification for isolate/drill/breadcrumb/exit"
```

---

## Self-review notes

- **Spec coverage:** decisions 1–6 all have a corresponding task — toggle (Task 3), replaces-not-stacks (Task 1's `nextExploreTarget`), snap-back-to-exact-step (Task 1's identity-when-inactive + Task 2's `renderedState`), unified container/leaf click (Task 1), reveal untouched (no task touches `@diascope/reveal`), auto-exit on step change (Task 2).
- **Type consistency:** `ExploreState`/`ExploreTarget` defined once in Task 1, imported unchanged in Tasks 2 and 3; `nextExploreTarget`/`drillBreadcrumb`/`applyExploreOverlay`/`INACTIVE_EXPLORE_STATE` names match between definition and every call site across tasks.
- **No GraphCanvas/camera/PopoverLayer changes anywhere** — confirms the spec's central architectural claim; verify this stays true during implementation review.
