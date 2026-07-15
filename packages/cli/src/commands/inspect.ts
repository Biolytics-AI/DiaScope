import { readFile } from "node:fs/promises";
import { inspectGraph } from "@diascope/d2";
import { toReadableD2Error } from "../d2-error.js";

export async function runInspect(d2Path: string) {
  try {
    return await inspectGraph(await readFile(d2Path, "utf8"));
  } catch (e) {
    throw toReadableD2Error(e);
  }
}
