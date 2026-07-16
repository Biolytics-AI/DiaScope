import type { GraphEdge, GraphIndex } from "./graph.js";
import type { NarrativeDocument, NodeSelector, Popover, Step, StepText } from "./schema.js";
import { resolveNodes, resolveTrace } from "./selectors.js";

export interface SceneState {
  visible: string[];
  highlighted: string[];
  dimmed: string[];
  traced: GraphEdge[];
  popovers: Popover[];
  cameraFit: string[];
  text?: StepText;
}

/**
 * Folds step visibility from step 0 through `upToIndex` (inclusive): visibility
 * seeds as ALL nodes unless steps[0].show is present (then it seeds empty);
 * each step's show adds nodes and hide removes them, in order.
 *
 * `resolver` resolves one show/hide value to node ids. resolveStep passes
 * resolveNodes (fail-fast on unknown refs); validateDocument passes a tolerant
 * resolver that skips unknown refs, since validation reports those errors
 * separately and must keep collecting.
 */
export function foldVisibility(
  steps: Step[],
  upToIndex: number,
  index: GraphIndex,
  resolver: (sel: NodeSelector | NodeSelector[] | undefined, index: GraphIndex) => string[]
): Set<string> {
  const visible = new Set<string>(steps[0]?.show ? [] : index.nodes.map(n => n.id));
  for (const step of steps.slice(0, upToIndex + 1)) {
    for (const id of resolver(step.show, index)) visible.add(id);
    for (const id of resolver(step.hide, index)) visible.delete(id);
  }
  return visible;
}

export function resolveStep(doc: NarrativeDocument, sceneId: string, stepIndex: number, index: GraphIndex): SceneState {
  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  if (stepIndex < 0 || stepIndex >= scene.steps.length)
    throw new Error(`Step ${stepIndex} out of range for scene "${sceneId}" (${scene.steps.length} steps)`);

  const visible = foldVisibility(scene.steps, stepIndex, index, resolveNodes);

  const cur = scene.steps[stepIndex];
  const focus = resolveNodes(cur.focus, index).filter(id => visible.has(id));
  const highlighted = (cur.highlight ? resolveNodes(cur.highlight, index) : focus).filter(id => visible.has(id));
  const focusSet = new Set(focus);
  const highlightSet = new Set(highlighted);
  // Explicit dim never contradicts emphasis: focused/highlighted ids are excluded.
  const dimmedSet = new Set(
    resolveNodes(cur.dim, index).filter(id => visible.has(id) && !focusSet.has(id) && !highlightSet.has(id))
  );
  if (focus.length) {
    for (const id of visible) if (!focusSet.has(id) && !highlightSet.has(id)) dimmedSet.add(id);
  }
  const traced = resolveTrace(cur.trace, index).map(e => ({ ...e }));
  const popovers: Popover[] = (cur.popover ? (Array.isArray(cur.popover) ? cur.popover : [cur.popover]) : [])
    .filter(p => visible.has(p.target))
    .map(p => ({ ...p }));

  let cameraFit: string[];
  const selection = [...new Set([...highlighted, ...focus])];
  if (cur.camera && Array.isArray(cur.camera.fit)) cameraFit = resolveNodes(cur.camera.fit, index);
  else if (cur.camera?.fit === "all") cameraFit = [...visible];
  else cameraFit = selection.length ? selection : [...visible];

  return {
    visible: [...visible].sort(),
    highlighted, dimmed: [...dimmedSet].sort(), traced, popovers, cameraFit,
    text: cur.text ? { ...cur.text } : undefined,
  };
}
