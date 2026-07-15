import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDocument, resolveStep, type SceneState } from "@diascope/core";
import { WasmD2Compiler } from "@diascope/d2";

export interface ResolveReport {
  state: SceneState;
  graphPath: string;
}

/**
 * Loads a narrative document + its compiled D2 graph (same path resolution as
 * runValidate) and computes the SceneState for one scene+step via @diascope/core's
 * resolveStep. Lets an agent preview exactly what the renderer would show for a given
 * step without spinning up the deck.
 */
export async function runResolve(docPath: string, sceneId: string, stepIndex: number): Promise<ResolveReport> {
  const doc = loadDocument(await readFile(docPath, "utf8"));
  const graphPath = resolve(dirname(docPath), doc.graph.source);
  try {
    await access(graphPath);
  } catch {
    throw new Error(`Graph source not found: ${graphPath} (referenced by ${docPath} as "${doc.graph.source}")`);
  }
  const { index } = await new WasmD2Compiler().compile(await readFile(graphPath, "utf8"));
  const state = resolveStep(doc, sceneId, stepIndex, index);
  return { state, graphPath };
}
