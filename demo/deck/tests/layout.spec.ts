import { test, expect, type Page } from "@playwright/test";
import { overlaps, contains, distance, type Rect } from "./geometry.js";

interface Entry { part: string; id: string | null; target: string | null; rect: Rect }

const STORY = process.env.STORY; // Phase B parametrization
const url = STORY ? `/?story=${STORY}` : "/";

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

  for (const drawer of of("drawer"))
    expect.soft(contains(scene.rect, drawer.rect, 4), msg("drawer escapes scene")).toBe(true);
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
  const errors = collectConsoleErrors(page);
  await waitForDeck(page);

  // Boundary step highlights the ingress node (annotated → clickable to open a drawer).
  await page.evaluate(() => (window as any).deck.slide(1, 0, 0));
  await settle(page);

  await clickNode(page, "Biolytics.Runtime.Ingress");
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
