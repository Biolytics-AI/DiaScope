import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadDocument, validateDocument, type ValidationResult } from "@diascope/core";
import { WasmD2Compiler } from "@diascope/d2";

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
  const { index } = await new WasmD2Compiler().compile(await readFile(graphPath, "utf8"));
  const { errors, warnings } = validateDocument(doc, index);
  return { valid: errors.length === 0, errors, warnings, graphPath };
}
