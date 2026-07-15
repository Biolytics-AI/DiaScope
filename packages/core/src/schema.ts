import { z } from "zod";

export type NodeSelector = string | { class: string } | { not: NodeSelector };
export const NodeSelectorSchema: z.ZodType<NodeSelector> = z.lazy(() =>
  z.union([
    z.string().min(1),
    z.strictObject({ class: z.string().min(1) }),
    z.strictObject({ not: NodeSelectorSchema }),
  ])
);
const Sel = z.union([NodeSelectorSchema, z.array(NodeSelectorSchema)]);

export const PopoverSchema = z.strictObject({ target: z.string(), content: z.string() });
export const CameraSchema = z.strictObject({
  fit: z.union([z.literal("selection"), z.literal("all"), z.array(NodeSelectorSchema)]),
});
export const StepTextSchema = z.strictObject({ title: z.string().optional(), body: z.string().optional() });

export const StepSchema = z.strictObject({
  id: z.string().optional(),
  text: StepTextSchema.optional(),
  // M1-rendered verbs
  show: Sel.optional(), hide: Sel.optional(), focus: Sel.optional(),
  highlight: Sel.optional(), dim: Sel.optional(),
  trace: z.union([z.string(), z.array(z.string())]).optional(),
  popover: z.union([PopoverSchema, z.array(PopoverSchema)]).optional(),
  camera: CameraSchema.optional(),
  // validated but deferred verbs (capability-gated)
  annotate: PopoverSchema.optional(),
  waitFor: z.literal("click").optional(),
  compare: z.strictObject({ left: Sel, right: Sel }).optional(),
  isolate: Sel.optional(),
  expand: z.string().optional(),
  collapse: z.string().optional(),
});

export const SceneSchema = z.strictObject({
  id: z.string().min(1),
  layout: z.literal("two-pane").default("two-pane"),
  text: StepTextSchema.optional(),
  annotations: z.strictObject({
    nodes: z.record(z.string(), z.string()).optional(),
    edges: z.record(z.string(), z.string()).optional(),
  }).optional(),
  steps: z.array(StepSchema).min(1),
});

export const NarrativeDocumentSchema = z.strictObject({
  version: z.literal(1),
  graph: z.strictObject({ source: z.string().min(1) }),
  scenes: z.array(SceneSchema).min(1),
});

export type Step = z.infer<typeof StepSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type NarrativeDocument = z.infer<typeof NarrativeDocumentSchema>;
export type Popover = z.infer<typeof PopoverSchema>;
