# Document-Driven Reveal Chapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a narrative document express which scenes belong to the same reveal.js horizontal slide (as a vertical stack) via an optional `chapter` tag on each scene, so deck authors get correct topology for free instead of hand-wiring it per app.

**Architecture:** `@diascope/core` gains a pure function, `groupIntoChapters(scenes)`, grouping consecutive same-`chapter` scenes. `@diascope/reveal` gains one new component, `<DeckOutline>`, that consumes that grouping and emits the right `Slide`/`Stack` tree — this is also what correctly enforces the existing "one `NarrativeScene` per `Slide`" constraint by construction. The demo app is migrated to use it.

**Tech Stack:** TypeScript, React 19, `@revealjs/react`, Vitest, @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-16-reveal-chapters-design.md` — read it first.

**Decision already made in the spec (not re-litigated here):** every chapterless scene becomes its own horizontal slide (no implicit "first scene is special" carve-out). Verified against the current demo: `demo/deck/scenes/vllm.yaml` has exactly 2 scenes (`request-path`, `audit-trail`), and today's hand-wired `App.tsx` already renders them as two separate horizontal slides (the existing `Stack` around scene 2 alone has zero visual effect — a stack of one item looks identical to a bare slide). So the new default produces byte-identical topology for the CURRENT vLLM demo with no `chapter` tags added. Task 3 below additionally tags both scenes into one shared chapter as a deliberate, disclosed demo enhancement — this DOES change the shipped demo's topology (from 2 horizontal slides to 1 horizontal slide containing a 2-deep vertical stack) so the feature is actually visibly exercised, not just backward-compatible.

---

## Conventions

- Branch `feat/diascope-v2-design` (already checked out — verify, don't switch).
- Explicit-path `git add` (never `-A`) — pre-existing untracked files (`packages/core/tests/zzz-probe.test.ts`, `packages/d2/probe-*.mjs`, `*.tsbuildinfo`) are permission-locked leftovers, leave them alone.
- `rm`/`kill` are permission-denied this session — never attempt; `mv` to scratchpad if relocating a scratch file.
- Don't touch `packages/diascope`.
- Build order: `npm run build -w @diascope/core` before `@diascope/reveal` or `demo/deck` (both depend on core's types/dist).
- Commit after every task, prefix `feat(chapters):`, `test(chapters):`.

---

### Task 1: Core — `Scene.chapter` and `groupIntoChapters`

**Files:**
- Modify: `packages/core/src/schema.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/chapters.ts`
- Test: `packages/core/tests/chapters.test.ts`

**Context:** `packages/core/src/schema.ts`'s `SceneSchema` currently has `id`/`layout`/`text`/`annotations`/`steps`/`views` (the last added by the audience-lenses sub-project — if that hasn't landed yet in your checkout, `views` won't be there; either way, only ADD the new field below, don't touch any existing field). Any `schema.ts` change requires regenerating the committed JSON Schema snapshot: after this task's Step 3, run `npm run build -w @diascope/core && npm run gen:schema -w @diascope/core` and include the regenerated `packages/core/schema/narrative.schema.json` in the commit (a prior sub-project's Task 1 discovered this is required — the serialize test suite compares against that committed snapshot).

- [ ] **Step 1: Write the failing test** (`tests/chapters.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import type { Scene } from "../src/schema.js";
import { groupIntoChapters } from "../src/chapters.js";

const scene = (id: string, chapter?: string): Scene => ({
  id, layout: "two-pane", steps: [{ id: `${id}-s0` }], ...(chapter ? { chapter } : {}),
});

describe("groupIntoChapters", () => {
  it("returns [] for no scenes", () => {
    expect(groupIntoChapters([])).toEqual([]);
  });

  it("chapterless scenes each get their own single-scene group", () => {
    const groups = groupIntoChapters([scene("a"), scene("b"), scene("c")]);
    expect(groups).toEqual([
      { chapter: null, scenes: [scene("a")] },
      { chapter: null, scenes: [scene("b")] },
      { chapter: null, scenes: [scene("c")] },
    ]);
  });

  it("consecutive scenes sharing a chapter merge into one group, in order", () => {
    const groups = groupIntoChapters([scene("a", "intro"), scene("b", "intro"), scene("c")]);
    expect(groups.map(g => g.chapter)).toEqual(["intro", null]);
    expect(groups[0].scenes.map(s => s.id)).toEqual(["a", "b"]);
    expect(groups[1].scenes.map(s => s.id)).toEqual(["c"]);
  });

  it("a chapter value repeated NON-consecutively does not merge the two runs", () => {
    const groups = groupIntoChapters([scene("a", "x"), scene("b", "y"), scene("c", "x")]);
    expect(groups.map(g => g.chapter)).toEqual(["x", "y", "x"]);
    expect(groups.map(g => g.scenes.map(s => s.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("mixes chaptered and chapterless scenes correctly", () => {
    const groups = groupIntoChapters([scene("a"), scene("b", "mid"), scene("c", "mid"), scene("d")]);
    expect(groups.map(g => ({ chapter: g.chapter, ids: g.scenes.map(s => s.id) }))).toEqual([
      { chapter: null, ids: ["a"] },
      { chapter: "mid", ids: ["b", "c"] },
      { chapter: null, ids: ["d"] },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/core`
Expected: FAIL (`Cannot find module '../src/chapters.js'`)

- [ ] **Step 3: Add `chapter` to `SceneSchema` in `src/schema.ts`**

Add ONE new optional field to the existing `SceneSchema` (every other field stays exactly as-is — don't reorder, don't touch `views` if present from a prior sub-project):

```ts
export const SceneSchema = z.strictObject({
  id: z.string().min(1),
  chapter: z.string().min(1).optional(),
  layout: z.literal("two-pane").default("two-pane"),
  text: StepTextSchema.optional(),
  annotations: z.strictObject({
    nodes: z.record(z.string(), z.string()).optional(),
    edges: z.record(z.string(), z.string()).optional(),
  }).optional(),
  steps: z.array(StepSchema).min(1),
  // views: ... (leave untouched if present from a prior sub-project)
});
```

(Place `chapter` right after `id` — it's a document-structure concern like `id`, not narrative content like `text`/`steps`.)

- [ ] **Step 4: Implement `src/chapters.ts`**

```ts
import type { Scene } from "./schema.js";

export interface ChapterGroup {
  chapter: string | null;
  scenes: Scene[];
}

/**
 * Groups scenes by consecutive run of the same `chapter` value. A chapterless scene
 * (`chapter === undefined`) never merges with its neighbors — even two adjacent chapterless
 * scenes stay as separate single-scene groups — so grouping only ever happens where an author
 * explicitly opts in via matching `chapter` values. Order-preserving: a chapter value repeated
 * non-consecutively produces separate groups, never merged across the gap.
 */
export function groupIntoChapters(scenes: Scene[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const scene of scenes) {
    const last = groups[groups.length - 1];
    if (last && scene.chapter !== undefined && last.chapter === scene.chapter) {
      last.scenes.push(scene);
    } else {
      groups.push({ chapter: scene.chapter ?? null, scenes: [scene] });
    }
  }
  return groups;
}
```

Add to `src/index.ts`: `export * from "./chapters.js";`

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w @diascope/core`
Expected: PASS (all `chapters.test.ts` cases + every pre-existing core test)

- [ ] **Step 6: Regenerate the JSON Schema snapshot**

```bash
npm run build -w @diascope/core
npm run gen:schema -w @diascope/core
npm run test -w @diascope/core
```

Expected: build clean, snapshot regenerates, `serialize.test.ts`'s snapshot-comparison test still passes.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/schema.ts packages/core/src/chapters.ts packages/core/src/index.ts packages/core/tests/chapters.test.ts packages/core/schema/narrative.schema.json
git commit -m "feat(chapters): Scene.chapter and groupIntoChapters"
```

---

### Task 2: `@diascope/reveal` — `<DeckOutline>`

**Files:**
- Create: `packages/reveal/src/DeckOutline.tsx`
- Modify: `packages/reveal/src/index.ts`
- Test: `packages/reveal/tests/deck-outline.test.tsx`

**Context:** `packages/reveal/src/NarrativeScene.tsx` exports `NarrativeScene` with props `{ d2Source, doc, sceneId, compiler? }` (read it if you need the exact prop shape — don't guess). `packages/reveal/src/index.ts` currently re-exports `NarrativeScene`/step-sync/`plugin`. `@revealjs/react`'s `Slide`/`Stack` are already a peer+dev dependency of this package (confirmed in `package.json`), so import them directly: `import { Slide, Stack } from "@revealjs/react";`. Tests in this package that render reveal components mock `@revealjs/react` (see `packages/reveal/tests/narrative-scene.test.tsx` for the established mocking pattern — read it before writing this task's test, reuse the same `vi.mock("@revealjs/react", ...)` approach rather than inventing a new one).

- [ ] **Step 1: Write the failing test** (`tests/deck-outline.test.tsx`) — read `narrative-scene.test.tsx` first to copy its exact `vi.mock("@revealjs/react", ...)` shape (it must mock `Slide`/`Stack` as simple passthrough elements you can query in the DOM, e.g. rendering `<section data-testid="slide">` / `<div data-testid="stack">` wrapping children — adapt to whatever mock shape that file already establishes for consistency; also mock `NarrativeScene` itself with `vi.mock("./NarrativeScene.js", () => ({ NarrativeScene: (props: any) => <div data-testid="scene" data-scene-id={props.sceneId} /> }))` so this test is purely about slide/stack structure, not diagram rendering):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { NarrativeDocument } from "@diascope/core";

vi.mock("@revealjs/react", () => ({
  Slide: ({ children }: { children?: React.ReactNode }) => <section data-testid="slide">{children}</section>,
  Stack: ({ children }: { children?: React.ReactNode }) => <div data-testid="stack">{children}</div>,
}));
vi.mock("./NarrativeScene.js", () => ({
  NarrativeScene: (props: { sceneId: string }) => <div data-testid="scene" data-scene-id={props.sceneId} />,
}));

const { DeckOutline } = await import("../src/DeckOutline.js");

function doc(scenes: { id: string; chapter?: string }[]): NarrativeDocument {
  return {
    version: 1,
    graph: { source: "g.d2" },
    scenes: scenes.map(s => ({ id: s.id, layout: "two-pane" as const, steps: [{ id: `${s.id}-s0` }], ...(s.chapter ? { chapter: s.chapter } : {}) })),
  };
}

describe("DeckOutline", () => {
  it("renders one bare Slide per chapterless scene, in order", () => {
    const { container } = render(<DeckOutline doc={doc([{ id: "a" }, { id: "b" }])} d2Source="src" />);
    const slides = container.querySelectorAll('[data-testid="slide"]');
    expect(slides.length).toBe(2);
    expect(container.querySelectorAll('[data-testid="stack"]').length).toBe(0);
    expect(slides[0].querySelector('[data-testid="scene"]')?.getAttribute("data-scene-id")).toBe("a");
    expect(slides[1].querySelector('[data-testid="scene"]')?.getAttribute("data-scene-id")).toBe("b");
  });

  it("wraps a same-chapter run in one Stack of Slides", () => {
    const { container } = render(
      <DeckOutline doc={doc([{ id: "a", chapter: "intro" }, { id: "b", chapter: "intro" }, { id: "c" }])} d2Source="src" />
    );
    const stacks = container.querySelectorAll('[data-testid="stack"]');
    expect(stacks.length).toBe(1);
    expect(stacks[0].querySelectorAll('[data-testid="slide"]').length).toBe(2);
    // the chapterless scene "c" is a bare Slide, a sibling of the stack, not inside it
    const topLevelSlides = Array.from(container.children[0].children).filter(
      el => el.getAttribute("data-testid") === "slide"
    );
    expect(topLevelSlides.length).toBe(1);
  });

  it("renders an optional leading title slide before the outline when provided", () => {
    const { container } = render(
      <DeckOutline doc={doc([{ id: "a" }])} d2Source="src" renderTitleSlide={() => <h1>Title</h1>} />
    );
    const slides = container.querySelectorAll('[data-testid="slide"]');
    expect(slides.length).toBe(2); // title slide + scene "a"
    expect(slides[0].textContent).toContain("Title");
  });

  it("renders nothing extra when renderTitleSlide is omitted", () => {
    const { container } = render(<DeckOutline doc={doc([{ id: "a" }])} d2Source="src" />);
    expect(container.querySelectorAll('[data-testid="slide"]').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @diascope/reveal`
Expected: FAIL (`Cannot find module '../src/DeckOutline.js'`)

- [ ] **Step 3: Implement `src/DeckOutline.tsx`**

```tsx
import type { ReactNode } from "react";
import { Slide, Stack } from "@revealjs/react";
import type { NarrativeDocument } from "@diascope/core";
import { groupIntoChapters } from "@diascope/core";
import type { D2Compiler } from "@diascope/d2";
import { NarrativeScene } from "./NarrativeScene.js";

export interface DeckOutlineProps {
  doc: NarrativeDocument;
  d2Source: string;
  compiler?: D2Compiler;
  /** An optional leading Slide (e.g. a cover), rendered before the chapter outline. */
  renderTitleSlide?: () => ReactNode;
}

/**
 * Builds the reveal.js Slide/Stack tree from a document's scenes, grouped by `groupIntoChapters`
 * (consecutive same-`chapter` runs become one horizontal slide's vertical Stack; every other
 * scene is its own bare Slide). This is also what correctly enforces the "one NarrativeScene per
 * Slide" constraint by construction — deck authors no longer hand-verify it.
 */
export function DeckOutline({ doc, d2Source, compiler, renderTitleSlide }: DeckOutlineProps) {
  const groups = groupIntoChapters(doc.scenes);
  return (
    <>
      {renderTitleSlide?.()}
      {groups.map(group =>
        group.scenes.length > 1 ? (
          <Stack key={group.scenes[0].id}>
            {group.scenes.map(s => (
              <Slide key={s.id}>
                <NarrativeScene d2Source={d2Source} doc={doc} sceneId={s.id} compiler={compiler} />
              </Slide>
            ))}
          </Stack>
        ) : (
          <Slide key={group.scenes[0].id}>
            <NarrativeScene d2Source={d2Source} doc={doc} sceneId={group.scenes[0].id} compiler={compiler} />
          </Slide>
        )
      )}
    </>
  );
}
```

Add to `src/index.ts`: `export * from "./DeckOutline.js";`

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @diascope/reveal`
Expected: PASS (all 4 new tests + every pre-existing reveal test)

- [ ] **Step 5: Build and commit**

```bash
npm run build -w @diascope/reveal
git add packages/reveal/src/DeckOutline.tsx packages/reveal/src/index.ts packages/reveal/tests/deck-outline.test.tsx
git commit -m "feat(chapters): DeckOutline builds the reveal Slide/Stack tree from Scene.chapter"
```

---

### Task 3: Migrate the demo deck + tag the vLLM story

**Files:**
- Modify: `demo/deck/src/App.tsx`, `demo/deck/scenes/vllm.yaml`

**Context:** Read `demo/deck/src/App.tsx` in full first (reproduced in this plan's header note — confirm it matches; it may have shifted slightly since). `demo/deck/scenes/vllm.yaml` has exactly 2 scenes: `request-path` and `audit-trail`. This task tags them into one shared chapter as a deliberate demo enhancement (see the plan header's disclosed-change note) — after this change the deck shows one horizontal "slide 2" containing both scenes as a 2-deep vertical stack, instead of today's two separate horizontal slides.

- [ ] **Step 1: Tag `demo/deck/scenes/vllm.yaml`'s two scenes into one chapter**

Add `chapter: request-flow` as a new top-level key on EACH of the two scene entries (alongside their existing `id:` key — don't touch anything else in the file):

```yaml
scenes:
  - id: request-path
    chapter: request-flow
    text: { title: "Compliant GPU Blueprint" }
    # ...rest of the scene unchanged...
  - id: audit-trail
    chapter: request-flow
    text: { title: "Audit & evidence" }
    # ...rest of the scene unchanged...
```

Validate after editing: `node packages/cli/dist/index.js validate demo/deck/scenes/vllm.yaml --json` must still report `"valid": true, "errors": [], "warnings": []` (build `@diascope/core`/`@diascope/cli` first if dist is stale — `chapter` is a new optional field, schema-valid by construction, but run this to be sure nothing else broke).

- [ ] **Step 2: Migrate `App.tsx`**

Replace the whole file with:

```tsx
import { useEffect, useState } from "react";
import { Deck, Slide } from "@revealjs/react";
import { loadDocument, type NarrativeDocument } from "@diascope/core";
import { DeckOutline, DiaScopeRevealPlugin } from "@diascope/reveal";
import d2Source from "../../../examples/vLLM/deployment.d2?raw";
import docYaml from "../scenes/vllm.yaml?raw";

const builtinDoc = loadDocument(docYaml);

interface Story { doc: NarrativeDocument; d2: string }

function useStory(): Story | "loading" | "builtin" {
  const slug = new URLSearchParams(location.search).get("story");
  const [story, setStory] = useState<Story | "loading" | "builtin">(slug ? "loading" : "builtin");
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/stories/${slug}/story.yaml`).then(r => { if (!r.ok) throw new Error(`story.yaml: ${r.status}`); return r.text(); }),
      fetch(`/stories/${slug}/diagram.d2`).then(r => { if (!r.ok) throw new Error(`diagram.d2: ${r.status}`); return r.text(); }),
    ]).then(([yamlText, d2Text]) => setStory({ doc: loadDocument(yamlText), d2: d2Text }))
      .catch(err => { console.error("Failed to load story:", err); setStory("builtin"); });
  }, [slug]);
  return story;
}

export function App() {
  const story = useStory();
  if (story === "loading") return <p style={{ color: "#ccc", padding: "2rem" }}>Loading story…</p>;
  const doc = story === "builtin" ? builtinDoc : story.doc;
  const d2 = story === "builtin" ? d2Source : story.d2;
  return (
    <Deck config={{ hash: true, transition: "fade", controls: true, progress: true, width: 1280, height: 720, margin: 0, center: false }}
      plugins={[DiaScopeRevealPlugin]}
      onReady={deck => { (window as unknown as { deck: unknown }).deck = deck; }}>
      <DeckOutline
        doc={doc}
        d2Source={d2}
        renderTitleSlide={() => (
          <Slide>
            <div className="deck-title">
              <span className="deck-title-rule" aria-hidden="true" />
              <h2>{doc.scenes[0].text?.title ?? "DiaScope v2"}</h2>
              <p className="deck-title-sub">Graph-native narrative over reveal.js</p>
              <p className="deck-title-hint">→ to begin</p>
            </div>
          </Slide>
        )}
      />
    </Deck>
  );
}
```

(Note: `renderTitleSlide` returns a `<Slide>` itself now — `DeckOutline` renders whatever `renderTitleSlide()` returns directly, unlike the old code's separate hardcoded `<Slide>` before the outline. Also note `first`/`rest` destructuring and the manual `Stack` import are gone — `DeckOutline` owns that now.)

- [ ] **Step 3: Build and manually sanity-check**

```bash
npm run build -w @diascope/core && npm run build -w @diascope/d2 && npm run build -w @diascope/react && npm run build -w @diascope/reveal
npm run build -w diascope-demo-deck
```

Expected: all clean (vite build succeeds, proving the app compiles against the new `DeckOutline` import).

- [ ] **Step 4: Commit**

```bash
git add demo/deck/src/App.tsx demo/deck/scenes/vllm.yaml
git commit -m "feat(chapters): migrate demo deck to DeckOutline; tag vLLM scenes into one chapter"
```

---

### Task 4: Browser verification

**Files:**
- Modify: `demo/deck/tests/layout.spec.ts`

**Context:** Read the current file in full first — helper names/signatures have evolved across two prior sub-projects (explore mode, audience lenses); confirm `layout()`, `assertInvariants`, `settle`, `collectConsoleErrors` before writing. Ports 5173-5250 may have stale processes (`kill` denied) — start a fresh server if needed (`npm run dev -w diascope-demo-deck -- --port 5260 --strictPort`, backgrounded).

- [ ] **Step 1: Add a test verifying the new chapter structure live**

```ts
test("document-driven chapters: vLLM's two scenes stack into one horizontal slide", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto("/");
  await page.waitForFunction(() => (window as any).deck?.isReady());
  await page.waitForSelector('[data-diascope-part="canvas"] svg', { timeout: 30_000 });
  await settle(page);

  // Title slide (h=0) -> chapter slide (h=1) containing both scenes as a v-stack.
  await page.evaluate(() => (window as any).deck.slide(1, 0));
  await settle(page);
  const firstSceneIndices = await page.evaluate(() => (window as any).deck.getIndices());
  expect(firstSceneIndices).toMatchObject({ h: 1, v: 0 });

  await page.evaluate(() => (window as any).deck.slide(1, 1));
  await settle(page);
  const secondSceneIndices = await page.evaluate(() => (window as any).deck.getIndices());
  expect(secondSceneIndices).toMatchObject({ h: 1, v: 1 });

  // No third horizontal slide beyond the title + the one chapter — confirms the two scenes
  // grouped into a single Stack rather than becoming two separate horizontal slides.
  const totalHorizontal = await page.evaluate(() => (window as any).deck.getTotalSlides !== undefined
    ? undefined // not all reveal versions expose this the same way; fall back to indices probing below
    : undefined);
  void totalHorizontal;
  await page.evaluate(() => (window as any).deck.slide(2, 0));
  await settle(page);
  const beyondIndices = await page.evaluate(() => (window as any).deck.getIndices());
  // reveal.js clamps navigation past the last horizontal slide, so h stays at 1 (the last real slide).
  expect(beyondIndices.h).toBeLessThanOrEqual(1);

  expect(errors, `console/page errors: ${errors.join("\n")}`).toEqual([]);
});
```

(If `deck.getIndices()`/`deck.slide()` behave differently than assumed here — check against how the file's OTHER existing tests already navigate the deck, e.g. via `ArrowRight` keypresses or a documented navigation helper, and prefer reusing that established pattern over the `deck.slide(...)` calls sketched above if it's inconsistent with the rest of the file.)

- [ ] **Step 2: Run the new test**

```bash
npx playwright test --project=desktop -g "document-driven chapters"
```

Expected: pass, zero console errors.

- [ ] **Step 3: Run the full existing suite** (both viewports, default story + at least one prior sub-project's test story) to confirm zero regression from the `App.tsx` rewrite

```bash
npx playwright test --project=desktop
npx playwright test --project=narrow
STORY=c2f-flow npx playwright test --project=desktop
```

All must pass — this is the real proof that `DeckOutline` reproduces every existing story's correct navigation behavior (agent-authored stories have no `chapter` tags, so they must render as one-slide-per-scene, matching their pre-migration behavior exactly).

- [ ] **Step 4: Screenshot and eyeball**

Take one screenshot at the chapter slide's first scene and one after pressing Down (or `deck.slide(1,1)`) to confirm the second scene of the stack renders correctly (not a blank/broken transition). Save to scratchpad, read them, confirm both look right. If anything looks wrong, it's a `DeckOutline`/`App.tsx` bug — fix in `packages/reveal/src`/`demo/deck/src`, rebuild, re-verify.

- [ ] **Step 5: Commit**

```bash
git add demo/deck/tests/layout.spec.ts
git commit -m "test(chapters): playwright verification for document-driven chapter grouping"
```

---

## Self-review notes

- **Spec coverage:** `Scene.chapter` + `groupIntoChapters` (Task 1), `<DeckOutline>` (Task 2), demo migration + the disclosed vLLM topology change (Task 3), browser verification (Task 4) — all covered.
- **Backward compatibility is explicitly tested at two levels:** unit (Task 1's "chapterless scenes each get their own group" + "mixes chaptered and chapterless" cases) and live browser (Task 4 Step 3's run against `c2f-flow`, an agent-authored story with zero `chapter` tags — proves existing stories are unaffected by the migration).
- **Type consistency:** `groupIntoChapters(scenes: Scene[]): ChapterGroup[]` signature and `ChapterGroup { chapter: string | null; scenes: Scene[] }` shape are identical across Task 1's definition and Task 2's `DeckOutline` consumption.
- **Known scope boundary (not a gap):** `DeckOutline` takes `doc`/`d2Source`/`compiler?`/`renderTitleSlide?` — it does not expose per-chapter customization (e.g. per-chapter transition styles) beyond what `Deck`'s own top-level `config` already provides; this matches the spec's stated out-of-scope list (chapter-level UI chrome, nested chapters).
