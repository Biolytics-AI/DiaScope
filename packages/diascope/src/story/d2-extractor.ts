import type { StoryStep } from "./types.js";

const STEP_ANNOTATION = /^#\s*@step\s+(\S+)/;
const EDGE_LINE = /^([A-Za-z0-9_."' ]+?)\s*->\s*([A-Za-z0-9_."' ]+?)(?:\s*[:{]|$)/;
const NODE_DECL = /^([A-Za-z0-9_."']+(?:\.[A-Za-z0-9_."']+)*)(?:\s*[:{]|$)/;
const SKIP_LINE = /^\s*(#|$|\})/;

function parseNodesFromLine(line: string): string[] {
  const trimmed = line.trim();
  if (SKIP_LINE.test(trimmed)) return [];
  const edge = EDGE_LINE.exec(trimmed);
  if (edge) return [edge[1]!.trim(), edge[2]!.trim()];
  const node = NODE_DECL.exec(trimmed);
  if (node) return [node[1]!.trim()];
  return [];
}

export function extractStepsFromD2(d2Source: string): StoryStep[] {
  const lines = d2Source.split("\n");
  const steps: StoryStep[] = [];
  let current: StoryStep | null = null;

  for (const line of lines) {
    const annotationMatch = STEP_ANNOTATION.exec(line);
    if (annotationMatch) {
      if (current) steps.push(current);
      current = { id: annotationMatch[1]!, title: annotationMatch[1]!, nodes: [] };
      continue;
    }
    if (current) {
      const nodes = parseNodesFromLine(line);
      for (const n of nodes) {
        if (!current.nodes!.includes(n)) current.nodes!.push(n);
      }
    }
  }
  if (current) steps.push(current);
  return steps;
}
