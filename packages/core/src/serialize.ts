import yaml from "js-yaml";
import { NarrativeDocumentSchema, type NarrativeDocument } from "./schema.js";

const KEY_ORDER = [
  "version", "graph", "source", "scenes", "id", "layout", "text", "title", "body",
  "annotations", "nodes", "edges", "steps",
  "show", "hide", "focus", "highlight", "dim", "trace", "popover", "target", "content",
  "camera", "fit", "annotate", "waitFor", "compare", "left", "right", "isolate", "expand", "collapse",
  "class", "not",
];
const rank = (k: string) => { const i = KEY_ORDER.indexOf(k); return i === -1 ? KEY_ORDER.length : i; };

export function loadDocument(text: string): NarrativeDocument {
  return NarrativeDocumentSchema.parse(yaml.load(text));
}

export function canonicalYaml(doc: NarrativeDocument): string {
  return yaml.dump(doc, {
    sortKeys: (a: unknown, b: unknown) =>
      rank(String(a)) - rank(String(b)) || String(a).localeCompare(String(b)),
    lineWidth: 100, noRefs: true,
  });
}
