import type { GraphIndex } from "@diascope/core";

/**
 * SvgGraphBinding is the ONLY layer allowed to know how D2 encodes semantic ids into its
 * rendered SVG. D2 stamps each shape/connection group's first class token with the
 * base64 encoding of its graph id (connection ids are HTML-escaped before encoding, e.g.
 * `->` becomes `-&gt;`), so this binding decodes those tokens and cross-checks them
 * against the compiled GraphIndex to build an id -> Element lookup. Consumers (e.g. the
 * React renderer) go through nodeElement/edgeElement/bounds instead of touching SVG
 * structure directly.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const tryDecode = (token: string): string | null => {
  try {
    return atob(token).replaceAll("-&gt;", "->").replaceAll("&lt;-", "<-");
  } catch {
    return null;
  }
};

export class SvgGraphBinding {
  private byId = new Map<string, Element>();

  constructor(
    root: Element,
    private index: GraphIndex,
  ) {
    const known = new Set([...index.nodes.map((n) => n.id), ...index.edges.map((e) => e.id)]);
    for (const el of root.querySelectorAll("[class]")) {
      const first = (el.getAttribute("class") ?? "").trim().split(/\s+/)[0];
      if (!first) continue;
      const id = tryDecode(first);
      // Random class tokens can base64-decode to garbage that happens to be valid text, so
      // only accept ids that are actually present in the compiled graph index.
      if (id && known.has(id) && !this.byId.has(id)) this.byId.set(id, el);
    }
  }

  nodeElement(id: string): Element | null {
    return this.byId.get(id) ?? null;
  }

  edgeElement(id: string): Element | null {
    return this.byId.get(id) ?? null;
  }

  bounds(ids: string[]): Rect | null {
    const rects = ids
      .map((id) => this.index.nodes.find((n) => n.id === id)?.geometry)
      .filter((g): g is NonNullable<typeof g> => !!g);
    if (!rects.length) return null;

    const x1 = Math.min(...rects.map((r) => r.x));
    const y1 = Math.min(...rects.map((r) => r.y));
    const x2 = Math.max(...rects.map((r) => r.x + r.width));
    const y2 = Math.max(...rects.map((r) => r.y + r.height));
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
}
