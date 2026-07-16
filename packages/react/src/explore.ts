import type { GraphEdge, GraphIndex, SceneState } from "@diascope/core";

export type ExploreTarget = { kind: "isolate"; nodeId: string } | { kind: "drill"; containerId: string };

export interface ExploreState {
  active: boolean;
  target: ExploreTarget | null;
}

export const INACTIVE_EXPLORE_STATE: ExploreState = { active: false, target: null };

function childrenOf(containerId: string, index: GraphIndex): string[] {
  return index.nodes.filter(n => n.parent === containerId).map(n => n.id);
}

function neighborsOf(nodeId: string, index: GraphIndex): { ids: string[]; edges: GraphEdge[] } {
  const edges = index.edges.filter(e => e.source === nodeId || e.target === nodeId);
  const ids = edges.map(e => (e.source === nodeId ? e.target : e.source));
  return { ids, edges };
}

/**
 * Replaces the rendered SceneState with a neutral, fully-visible view while explore mode is
 * active, computed from the click target instead of authored selectors. Never reads the
 * authored visible/dim/cameraFit — entering explore mode means seeing the whole diagram, not
 * exploring through whatever the current step chose to hide. Identity when inactive, so exit
 * is instant and exactly restores the step you were on.
 */
export function applyExploreOverlay(authored: SceneState, explore: ExploreState, index: GraphIndex): SceneState {
  if (!explore.active) return authored;

  const allIds = index.nodes.map(n => n.id);
  const base: SceneState = {
    visible: allIds,
    highlighted: [],
    dimmed: [],
    traced: [],
    popovers: [],
    cameraFit: allIds,
    text: authored.text,
  };

  if (!explore.target) return base;

  if (explore.target.kind === "isolate") {
    const { ids: neighborIds, edges } = neighborsOf(explore.target.nodeId, index);
    const highlighted = [explore.target.nodeId, ...neighborIds];
    return {
      ...base,
      highlighted,
      dimmed: allIds.filter(id => !highlighted.includes(id)),
      traced: edges,
      cameraFit: highlighted,
    };
  }

  const children = childrenOf(explore.target.containerId, index);
  if (children.length === 0) {
    return applyExploreOverlay(
      authored,
      { active: true, target: { kind: "isolate", nodeId: explore.target.containerId } },
      index
    );
  }
  const highlighted = [explore.target.containerId, ...children];
  return {
    ...base,
    highlighted,
    dimmed: allIds.filter(id => !highlighted.includes(id)),
    cameraFit: highlighted,
  };
}

/** Classifies a click: nodes with children in `index` drill, everything else isolates.
 *  Re-clicking the current drill target zooms back out (null); re-clicking the current
 *  isolate target is a no-op; anything else replaces the current target. */
export function nextExploreTarget(clickedId: string, current: ExploreTarget | null, index: GraphIndex): ExploreTarget | null {
  const isContainer = index.nodes.some(n => n.parent === clickedId);
  if (isContainer) {
    if (current?.kind === "drill" && current.containerId === clickedId) return null;
    return { kind: "drill", containerId: clickedId };
  }
  if (current?.kind === "isolate" && current.nodeId === clickedId) return current;
  return { kind: "isolate", nodeId: clickedId };
}

/** Root-to-leaf ancestor chain for breadcrumb rendering, derived from the index's parent
 *  links (no manually-tracked drill history needed). Empty for an id not in the index. */
export function drillBreadcrumb(containerId: string, index: GraphIndex): string[] {
  if (!index.nodes.some(n => n.id === containerId)) return [];
  const chain: string[] = [];
  let cur: string | null = containerId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    cur = index.nodes.find(n => n.id === cur)?.parent ?? null;
  }
  return chain;
}
