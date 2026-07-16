import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { effectiveSteps, loadDocument, resolveStepInView, type SceneState } from "@diascope/core";
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
 *
 * resolveStepInView itself CLAMPS an out-of-range stepIndex rather than throwing — that's the
 * right contract for the live renderer, which can receive a transient/stale stepIndex prop
 * during async lens-switching and must never crash. But this CLI is a deliberate one-shot
 * preview tool: an agent explicitly passes --step N, and if it's a typo (e.g. --step 20 meaning
 * --step 2), silent clamping would return a plausible-looking but wrong SceneState with no
 * signal anything was off. So the CLI validates stepIndex against the resolved view's actual
 * step count BEFORE delegating, and throws — restoring the pre-existing resolveStep contract —
 * instead of inheriting the renderer's crash-safety clamp.
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
  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  const views = effectiveSteps(scene);
  const view = views.find(v => v.id === viewId) ?? views[0];
  if (stepIndex < 0 || stepIndex >= view.steps.length)
    throw new Error(`Step ${stepIndex} out of range for view "${viewId}" in scene "${sceneId}" (${view.steps.length} steps)`);
  const state = resolveStepInView(doc, sceneId, viewId, stepIndex, index);
  return { state, graphPath };
}
