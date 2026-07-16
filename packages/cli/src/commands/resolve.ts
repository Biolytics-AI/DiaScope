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
