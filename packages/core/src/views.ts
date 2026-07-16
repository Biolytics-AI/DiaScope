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
