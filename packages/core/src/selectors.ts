import type { GraphEdge, GraphIndex } from "./graph.js";
import type { NodeSelector } from "./schema.js";

export class UnknownReferenceError extends Error {
  constructor(public ref: string, public kind: "node" | "edge" | "trace", public suggestions: string[]) {
    super(
      kind === "trace"
        ? `Invalid trace "${ref}" — a trace needs at least two node ids separated by "->"`
        : `Unknown ${kind} "${ref}"${suggestions.length ? ` — did you mean: ${suggestions.join(", ")}?` : ""}`
    );
  }
}

function levenshtein(a: string, b: string): number {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

export function suggest(ref: string, candidates: string[], max = 3): string[] {
  return candidates
    .map(c => ({ c, d: levenshtein(ref.toLowerCase(), c.toLowerCase()) }))
    .filter(({ d }) => d <= Math.max(2, Math.floor(ref.length / 3)))
    .sort((x, y) => x.d - y.d).slice(0, max).map(({ c }) => c);
}

export function resolveNodes(sel: NodeSelector | NodeSelector[] | undefined, index: GraphIndex): string[] {
  if (sel === undefined) return [];
  if (Array.isArray(sel)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of sel)
      for (const id of resolveNodes(s, index))
        if (!seen.has(id)) { seen.add(id); out.push(id); }
    return out;
  }
  if (typeof sel === "string") {
    if (index.nodes.some(n => n.id === sel)) return [sel];
    throw new UnknownReferenceError(sel, "node", suggest(sel, index.nodes.map(n => n.id)));
  }
  if ("class" in sel) return index.nodes.filter(n => n.classes.includes(sel.class)).map(n => n.id);
  const excluded = new Set(resolveNodes(sel.not, index));
  return index.nodes.map(n => n.id).filter(id => !excluded.has(id));
}

/**
 * Finds the edge from `source` to `target` in the index.
 *
 * When the D2 source declares parallel edges between the same pair of nodes
 * (e.g. `(a -> b)[0]` and `(a -> b)[1]`), the FIRST match wins: traces can
 * only ever reference the `[0]` edge, and later parallels are unreachable via
 * `resolveTrace`. This is a known M1 limitation; validation warns about it in
 * a later milestone.
 */
export function findEdge(source: string, target: string, index: GraphIndex): GraphEdge | undefined {
  return index.edges.find(e => e.source === source && e.target === target);
}

export function resolveTrace(trace: string | string[] | undefined, index: GraphIndex): GraphEdge[] {
  if (!trace) return [];
  const specs = Array.isArray(trace) ? trace : [trace];
  const out: GraphEdge[] = [];
  for (const spec of specs) {
    const hops = spec.split("->").map(s => s.trim()).filter(Boolean);
    if (hops.length < 2) throw new UnknownReferenceError(spec, "trace", []);
    for (let i = 0; i < hops.length - 1; i++) {
      for (const hop of [hops[i], hops[i + 1]]) {
        if (!index.nodes.some(n => n.id === hop))
          throw new UnknownReferenceError(hop, "node", suggest(hop, index.nodes.map(n => n.id)));
      }
      const edge = findEdge(hops[i], hops[i + 1], index);
      if (!edge) {
        const candidates = index.edges.map(e => `${e.source}->${e.target}`);
        throw new UnknownReferenceError(`${hops[i]}->${hops[i + 1]}`, "edge", suggest(`${hops[i]}->${hops[i + 1]}`, candidates));
      }
      out.push(edge);
    }
  }
  return out;
}
