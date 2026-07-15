import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import yaml from "js-yaml";
import { overlaps, contains, distance, type Rect } from "./geometry.js";

interface Entry { part: string; id: string | null; target: string | null; rect: Rect }

const STORY = process.env.STORY; // Phase B parametrization
const url = STORY ? `/?story=${STORY}` : "/";

// --- Story-agnostic target resolution for the drawer test ------------------------------
// The drawer test used to hardcode a vLLM-specific node id + fragment index, so it broke
// for every Phase B story. Instead, read whatever document is actually active straight off
// disk (mirroring App.tsx's own STORY switch) and derive (scene, step, node) structurally:
// the first scene with node annotations, and the first step in that scene whose highlight
// (falling back to focus, same precedence as resolveStep) names one of the annotated node
// ids. That's the step where the node is actually clickable — applyStateToSvg only stamps
// data-diascope-id on currently-*highlighted* nodes (packages/react/src/state-classes.ts),
// so clickNode's locator needs that exact step, not just any step where the node is visible.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "../../..");

interface RawStep { focus?: unknown; highlight?: unknown }
interface RawScene { id: string; annotations?: { nodes?: Record<string, string> }; steps: RawStep[] }
interface RawDoc { scenes: RawScene[] }

function loadActiveDoc(): RawDoc {
  const docPath = STORY
    ? resolvePath(repoRoot, "demo/deck/public/stories", STORY, "story.yaml")
    : resolvePath(repoRoot, "demo/deck/scenes/vllm.yaml");
  return yaml.load(readFileSync(docPath, "utf8")) as RawDoc;
}

// A NodeSelector is a string id, an array of ids/selectors, or an object selector
// ({class:...}/{not:...}) — see packages/core/src/schema.ts. Only the string / array-of-
// strings forms are structurally resolvable without compiling the D2 graph; object
// selectors contribute no ids here. Every story authored so far (built-in + both Phase B
// agent stories) uses plain id lists for focus/highlight, so this is sufficient.
function selectorIds(sel: unknown): string[] {
  if (typeof sel === "string") return [sel];
  if (Array.isArray(sel)) return sel.filter((s): s is string => typeof s === "string");
  return [];
}

interface DrawerTarget { sceneIndex: number; stepIndex: number; nodeId: string }

function findDrawerTarget(doc: RawDoc): DrawerTarget | null {
  for (let sceneIndex = 0; sceneIndex < doc.scenes.length; sceneIndex++) {
    const scene = doc.scenes[sceneIndex];
    const nodeIds = Object.keys(scene.annotations?.nodes ?? {});
    if (nodeIds.length === 0) continue;
    for (let stepIndex = 0; stepIndex < scene.steps.length; stepIndex++) {
      const step = scene.steps[stepIndex];
      const ids = selectorIds(step.highlight ? step.highlight : step.focus);
      const nodeId = nodeIds.find(id => ids.includes(id));
      if (nodeId) return { sceneIndex, stepIndex, nodeId };
    }
  }
  return null;
}

// Matches App.tsx's layout: title slide h=0, first scene h=1 (v=0), remaining scenes
// stacked at h=2, v = (scene index - 1).
function slidePosition(sceneIndex: number): { h: number; v: number } {
  return sceneIndex === 0 ? { h: 1, v: 0 } : { h: 2, v: sceneIndex - 1 };
}

const layout = (page: Page): Promise<Entry[]> =>
  page.evaluate(() => (window as any).__diascopeDebug?.layout() ?? []);

// reveal.js keeps every slide in the DOM; non-current scenes are display:none and thus
// report all-zero rects from getBoundingClientRect. Keep only the parts that actually have
// on-screen geometry so a single visible scene's parts are what we assert against.
const visibleEntries = (entries: Entry[]): Entry[] =>
  entries.filter(e => e.rect.width > 1 && e.rect.height > 1);

interface DeckState { indices: { h: number; v: number; f: number }; isLast: boolean; fragments: { prev: boolean; next: boolean } }
const deckState = (page: Page): Promise<DeckState> =>
  page.evaluate(() => {
    const d = (window as any).deck;
    const idx = d.getIndices();
    return {
      indices: { h: idx.h ?? 0, v: idx.v ?? 0, f: idx.f ?? -1 },
      isLast: d.isLastSlide(),
      fragments: d.availableFragments(),
    };
  });

async function settle(page: Page) {
  await page.waitForTimeout(1000); // camera + trace animations (~600ms) plus a margin
}

async function waitForDeck(page: Page) {
  await page.goto(url);
  await page.waitForFunction(
    () => !!(window as any).deck && !!document.querySelector(".diascope-scene svg"),
    null,
    { timeout: 60_000 }
  );
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", err => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function assertInvariants(page: Page, label: string) {
  const raw = await layout(page);
  const entries = visibleEntries(raw);
  const of = (part: string) => entries.filter(e => e.part === part);
  const canvas = of("canvas")[0], pane = of("pane")[0], scene = of("scene")[0];
  if (!canvas || !pane || !scene) return; // non-scene slide (title): nothing to check
  const msg = (s: string) => `${label}: ${s}`;

  expect.soft(overlaps(canvas.rect, pane.rect), msg("canvas overlaps narration pane")).toBe(false);

  for (const pill of of("pill-row"))
    expect.soft(contains(pane.rect, pill.rect, 4), msg("pill-row escapes pane")).toBe(true);

  for (const pop of of("popover")) {
    expect.soft(overlaps(pop.rect, pane.rect), msg(`popover(${pop.target}) overlaps pane`)).toBe(false);
    expect.soft(contains(scene.rect, pop.rect, 8), msg(`popover(${pop.target}) escapes scene`)).toBe(true);
    const target = of("node-highlight").find(n => n.id === pop.target);
    if (target) {
      expect.soft(overlaps(pop.rect, target.rect), msg(`popover overlaps its target ${pop.target}`)).toBe(false);
      expect.soft(distance(pop.rect, target.rect), msg(`popover too far from target ${pop.target}`)).toBeLessThan(80);
    }
  }

  for (const node of of("node-highlight"))
    expect.soft(contains(canvas.rect, node.rect, 6), msg(`highlighted node ${node.id} outside camera viewport`)).toBe(true);

  for (const drawer of of("drawer")) {
    expect.soft(contains(scene.rect, drawer.rect, 4), msg("drawer escapes scene")).toBe(true);
    // The drawer slides over the canvas only; it must never cover the narration pane.
    expect.soft(overlaps(drawer.rect, pane.rect), msg("drawer overlaps narration pane")).toBe(false);
  }
}

async function clickNode(page: Page, id: string) {
  const loc = page.locator(`[data-diascope-id="${id}"]`);
  await loc.waitFor({ state: "attached", timeout: 10_000 });
  try {
    await loc.click({ timeout: 5000 });
  } catch {
    const box = await loc.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    else await loc.click({ force: true });
  }
}

test("walks the deck forward and backward, invariants hold at every step", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const errors = collectConsoleErrors(page);
  await waitForDeck(page);

  // Forward: press ArrowRight through every fragment/slide until the very last step.
  for (let i = 0; i < 40; i++) {
    await settle(page);
    const s = await deckState(page);
    await assertInvariants(page, `${project} fwd @ ${s.indices.h}/${s.indices.v}/f${s.indices.f}`);
    await page.screenshot({ path: `screens/${project}-fwd-${String(i).padStart(2, "0")}.png` });
    if (s.isLast && !s.fragments.next) break;
    await page.keyboard.press("ArrowRight");
  }

  // Backward: reversibility — the same invariants must hold walking all the way back.
  for (let i = 0; i < 40; i++) {
    await settle(page);
    const s = await deckState(page);
    await assertInvariants(page, `${project} back @ ${s.indices.h}/${s.indices.v}/f${s.indices.f}`);
    await page.screenshot({ path: `screens/${project}-back-${String(i).padStart(2, "0")}.png` });
    if (s.indices.h === 0 && s.indices.v === 0 && !s.fragments.prev) break;
    await page.keyboard.press("ArrowLeft");
  }

  expect(errors, `console errors during forward/backward walk:\n${errors.join("\n")}`).toHaveLength(0);
});

test("live resize keeps invariants at a popover step", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  await waitForDeck(page);

  // Slide 1 = request-path scene; fragment index 0 = step 1 (boundary) which shows the
  // Ingress popover over the highlighted ingress node.
  await page.evaluate(() => (window as any).deck.slide(1, 0, 0));
  await settle(page);
  await assertInvariants(page, "resize/before");

  const start = page.viewportSize()!;
  await page.setViewportSize({ width: 1100, height: 750 });
  await page.waitForTimeout(1500); // reveal rescale + camera re-fit + popover re-measure
  await assertInvariants(page, "after-resize");

  await page.setViewportSize(start);
  await page.waitForTimeout(1500);
  await assertInvariants(page, "resize/restored");

  expect(errors, `console errors during resize:\n${errors.join("\n")}`).toHaveLength(0);
});

test("node drawer opens, passes invariants, and closes", async ({ page }, testInfo) => {
  const target = findDrawerTarget(loadActiveDoc());
  test.skip(!target, "active document has no scene with node annotations — nothing to click");
  if (!target) return; // unreachable after test.skip(true, ...), narrows for TS below

  const errors = collectConsoleErrors(page);
  await waitForDeck(page);

  // Navigate to the target scene and, if the highlighting step isn't the scene's first
  // (fragment -1 / no fragments revealed), advance to the fragment that reveals it.
  const pos = slidePosition(target.sceneIndex);
  const fragment = target.stepIndex > 0 ? target.stepIndex - 1 : undefined;
  await page.evaluate(
    (p: { h: number; v: number; f: number | undefined }) => (window as any).deck.slide(p.h, p.v, p.f),
    { h: pos.h, v: pos.v, f: fragment }
  );
  await settle(page);

  await clickNode(page, target.nodeId);
  await settle(page);

  const entries = visibleEntries(await layout(page));
  expect(entries.some(e => e.part === "drawer"), "drawer did not open on node click").toBe(true);
  await assertInvariants(page, "drawer-open");

  await page.getByLabel("Close details").click();
  await page.waitForTimeout(300);
  const afterClose = visibleEntries(await layout(page));
  expect(afterClose.some(e => e.part === "drawer"), "drawer did not close").toBe(false);

  expect(errors, `console errors during drawer test:\n${errors.join("\n")}`).toHaveLength(0);
});
