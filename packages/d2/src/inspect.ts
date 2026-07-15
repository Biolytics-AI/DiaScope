import type { GraphIndex } from "@diascope/core";
import { WasmD2Compiler } from "./compiler.js";

export async function inspectGraph(source: string): Promise<GraphIndex> {
  const { index } = await new WasmD2Compiler().compile(source);
  return index;
}
