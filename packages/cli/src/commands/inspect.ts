import { readFile } from "node:fs/promises";
import { inspectGraph } from "@diascope/d2";

export async function runInspect(d2Path: string) {
  return inspectGraph(await readFile(d2Path, "utf8"));
}
