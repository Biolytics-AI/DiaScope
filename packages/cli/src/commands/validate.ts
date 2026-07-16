import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDocument, validateDocument, type ValidationResult } from "@diascope/core";
import { WasmD2Compiler } from "@diascope/d2";
import { toReadableD2Error } from "../d2-error.js";

export interface ValidateReport extends ValidationResult {
  valid: boolean;
  graphPath: string;
}

export async function runValidate(docPath: string): Promise<ValidateReport> {
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
  const { errors, warnings } = validateDocument(doc, index);
  return { valid: errors.length === 0, errors, warnings, graphPath };
}
