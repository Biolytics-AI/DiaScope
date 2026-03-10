import type { StoryFile } from "./types.js";
import type { ViewerOptions } from "../viewer/types.js";

export function storyToViewerOptions(story: StoryFile): ViewerOptions {
  const nodeIdSet = new Set<string>();
  for (const step of story.steps) {
    for (const n of step.nodes ?? []) nodeIdSet.add(n);
  }
  return {
    steps: story.steps.map((s) => ({
      tag: s.tag,
      title: s.title,
      body: s.body,
      nodes: s.nodes,
    })),
    nodeIds: Array.from(nodeIdSet),
    detailPanels: story.detail_panels,
    edgeTooltips: story.edge_tooltips,
  };
}
