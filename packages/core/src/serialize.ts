import yaml from "js-yaml";
import { z } from "zod";
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
  try {
    return NarrativeDocumentSchema.parse(yaml.load(text));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error("Invalid narrative document:\n" + z.prettifyError(err), { cause: err });
    }
    throw err;
  }
}

export function canonicalYaml(doc: NarrativeDocument): string {
  return yaml.dump(doc, {
    sortKeys: (a: unknown, b: unknown) =>
      rank(String(a)) - rank(String(b)) || String(a).localeCompare(String(b)),
    lineWidth: 100, noRefs: true,
  });
}
