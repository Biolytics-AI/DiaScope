export interface GraphNode {
  id: string;            // dot notation for nesting, e.g. "sys.api"
  label: string;
  classes: string[];
  parent: string | null;
  geometry?: { x: number; y: number; width: number; height: number }; // diagram coords
}
export interface GraphEdge {
  id: string;            // d2 connection id, e.g. "(a -> b)[0]"
  source: string;
  target: string;
  label?: string;
}
export interface GraphIndex { nodes: GraphNode[]; edges: GraphEdge[] }
