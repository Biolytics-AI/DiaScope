#!/usr/bin/env node
/**
 * Record a walkthrough GIF of the DiaScope viewer stepping through the vLLM example.
 *
 * Usage:
 *   node scripts/record-demo.mjs [--out <path>]
 *
 * Requires:
 *   - playwright (npm install)
 *   - npx playwright install chromium
 *   - ffmpeg on PATH
 *
 * Default output: docs/demo.gif
 */

import { chromium } from 'playwright';
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// Parse --out flag
const outIdx = process.argv.indexOf('--out');
const OUT_GIF = outIdx !== -1
  ? resolve(process.argv[outIdx + 1])
  : join(ROOT, 'docs', 'demo.gif');

const HTML = join(ROOT, 'examples', 'vLLM', 'deployment.html');
const FRAMES_DIR = join(ROOT, '.playwright-mcp', 'demo-recording');

// Viewport — wide enough to show both diagram and panel clearly.
const W = 1200;
const H = 680;

// Timing (ms)
const INITIAL_LOAD_MS = 1500;   // viewer mount + first zoom-in
const FIRST_STEP_DWELL_MS = 1800;
const STEP_ANIM_MS = 1100;      // zoom/pan animation per step
const STEP_DWELL_MS = 1400;     // hold to read narration
const FINAL_DWELL_MS = 2200;

// GIF output settings
const GIF_FPS = 15;
const GIF_WIDTH = 1200;         // keep at full width, GitHub renders it fine

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

async function countSteps(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll('#step-nav button')];
    // exclude the "All" button
    return btns.filter(b => b.textContent?.trim() !== 'All').length;
  });
}

async function main() {
  if (!existsSync(HTML)) {
    console.error(`\nBuilt HTML not found at:\n  ${HTML}\n\nRun first:\n  npm run build\n  npm run docs:prepare-assets\n`);
    process.exit(1);
  }

  if (!hasFfmpeg()) {
    console.error('\nffmpeg is required but not found on PATH.\n  macOS: brew install ffmpeg\n  Ubuntu: sudo apt-get install -y ffmpeg\n');
    process.exit(1);
  }

  mkdirSync(FRAMES_DIR, { recursive: true });
  // Clean any previous recording artefacts
  for (const f of readdirSync(FRAMES_DIR)) rmSync(join(FRAMES_DIR, f), { recursive: true });

  mkdirSync(dirname(OUT_GIF), { recursive: true });

  console.log('Launching browser…');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: FRAMES_DIR, size: { width: W, height: H } },
  });
  const page = await context.newPage();

  console.log(`Opening ${HTML}`);
  await page.goto(`file://${HTML}`);

  // Wait for the viewer shell to be ready
  await page.waitForSelector('#btn-next', { state: 'visible' });
  console.log(`Waiting ${INITIAL_LOAD_MS}ms for initial render + zoom-in…`);
  await page.waitForTimeout(INITIAL_LOAD_MS);

  const stepCount = await countSteps(page);
  console.log(`Found ${stepCount} steps.`);

  // Dwell on step 1
  await page.waitForTimeout(FIRST_STEP_DWELL_MS);

  for (let i = 1; i < stepCount; i++) {
    console.log(`Step ${i + 1} / ${stepCount}`);
    await page.click('#btn-next');
    await page.waitForTimeout(STEP_ANIM_MS + STEP_DWELL_MS);
  }

  // Final dwell
  await page.waitForTimeout(FINAL_DWELL_MS);

  console.log('Closing browser (finalises video)…');
  await context.close();
  await browser.close();

  // Locate the recorded .webm
  const webm = readdirSync(FRAMES_DIR).find(f => f.endsWith('.webm'));
  if (!webm) {
    console.error('No .webm file found in recording dir.');
    process.exit(1);
  }
  const webmPath = join(FRAMES_DIR, webm);
  console.log(`Video recorded: ${webmPath}`);

  // Convert to palette-optimised GIF
  console.log(`Converting to GIF → ${OUT_GIF}`);
  const ffmpegFilter = [
    `fps=${GIF_FPS}`,
    `scale=${GIF_WIDTH}:-2:flags=lanczos`,
    `split[s0][s1]`,
    `[s0]palettegen=stats_mode=full[p]`,
    `[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
  ].join(',');

  execSync(
    `ffmpeg -y -i "${webmPath}" -vf "${ffmpegFilter}" -loop 0 "${OUT_GIF}"`,
    { stdio: 'inherit' },
  );

  console.log(`\n✓ Done: ${OUT_GIF}`);
}

main().catch(e => { console.error(e); process.exit(1); });
