import type { GraphIndex } from "@diascope/core";

/** Minimal shape of a D2 diagram shape we depend on (subset of @terrastruct/d2's Shape). */
export interface D2Shape {
  id: string;
  label?: string;
  classes?: string[];
  pos: { x: number; y: number };
  width: number;
  height: number;
}

/** Minimal shape of a D2 diagram connection we depend on (subset of @terrastruct/d2's Connection). */
export interface D2Connection {
  id: string;
  src: string;
  dst: string;
  label?: string;
}

export interface D2Diagram {
  shapes: D2Shape[];
  connections: D2Connection[];
}

export function buildGraphIndex(diagram: D2Diagram): GraphIndex {
  return {
    nodes: diagram.shapes.map((s) => ({
      id: s.id,
      label: s.label || s.id,
      classes: s.classes ?? [],
      parent: s.id.includes(".") ? s.id.slice(0, s.id.lastIndexOf(".")) : null,
      geometry: { x: s.pos.x, y: s.pos.y, width: s.width, height: s.height },
    })),
    edges: diagram.connections.map((c) => ({
      id: c.id,
      source: c.src,
      target: c.dst,
      ...(c.label ? { label: c.label } : {}),
    })),
  };
}
