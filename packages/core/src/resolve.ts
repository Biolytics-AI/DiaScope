import type { GraphEdge, GraphIndex } from "./graph.js";
import type { NarrativeDocument, Popover } from "./schema.js";
import { resolveNodes, resolveTrace } from "./selectors.js";

export interface SceneState {
  visible: string[];
  highlighted: string[];
  dimmed: string[];
  traced: GraphEdge[];
  popovers: Popover[];
  cameraFit: string[];
  text?: { title?: string; body?: string };
}

export function resolveStep(doc: NarrativeDocument, sceneId: string, stepIndex: number, index: GraphIndex): SceneState {
  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  if (stepIndex < 0 || stepIndex >= scene.steps.length)
    throw new Error(`Step ${stepIndex} out of range for scene "${sceneId}" (${scene.steps.length} steps)`);

  const visible = new Set<string>(scene.steps[0].show ? [] : index.nodes.map(n => n.id));
  for (const step of scene.steps.slice(0, stepIndex + 1)) {
    for (const id of resolveNodes(step.show, index)) visible.add(id);
    for (const id of resolveNodes(step.hide, index)) visible.delete(id);
  }

  const cur = scene.steps[stepIndex];
  const focus = resolveNodes(cur.focus, index).filter(id => visible.has(id));
  const highlighted = (cur.highlight ? resolveNodes(cur.highlight, index) : focus).filter(id => visible.has(id));
  const dimmedSet = new Set(resolveNodes(cur.dim, index).filter(id => visible.has(id)));
  if (focus.length) {
    for (const id of visible) if (!focus.includes(id) && !highlighted.includes(id)) dimmedSet.add(id);
  }
  const traced = resolveTrace(cur.trace, index);
  const popovers: Popover[] = cur.popover ? (Array.isArray(cur.popover) ? cur.popover : [cur.popover]) : [];

  let cameraFit: string[];
  const selection = [...new Set([...highlighted, ...focus])];
  if (cur.camera && Array.isArray(cur.camera.fit)) cameraFit = resolveNodes(cur.camera.fit, index);
  else if (cur.camera?.fit === "all") cameraFit = [...visible];
  else cameraFit = selection.length ? selection : [...visible];

  return {
    visible: [...visible].sort(),
    highlighted, dimmed: [...dimmedSet].sort(), traced, popovers, cameraFit,
    text: cur.text,
  };
}
