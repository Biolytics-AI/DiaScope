import { z } from "zod";
import type { NarrativeDocument, Step } from "./schema.js";
import { NarrativeDocumentSchema } from "./schema.js";

/**
 * Shape of a legacy DiaScope `.story.yaml` file (pre-M1).
 * See packages/diascope/src/story/types.ts for the authoritative legacy type.
 *
 * NOTE: `edge_tooltips` keys are edge LABELS (not "a->b" pairs). They pass
 * through verbatim into `annotations.edges` — the renderer matches by label
 * OR by source->target.
 */
export interface LegacyStory {
  meta?: { title?: string; description?: string; d2_source?: string };
  overview?: { position?: "first" | "last"; title?: string; body?: string };
  steps: { id: string; tag?: string; title: string; body?: string; nodes?: string[] }[];
  detail_panels?: Record<string, string>;
  edge_tooltips?: Record<string, string>;
}

export function fromLegacyStory(story: LegacyStory): NarrativeDocument {
  const narrated: Step[] = story.steps.map(s => ({
    id: s.id,
    text: { title: s.title, ...(s.body ? { body: s.body } : {}) },
    ...(s.nodes?.length ? { highlight: s.nodes, camera: { fit: "selection" as const } } : {}),
  }));

  const overviewStep: Step | null = story.overview
    ? {
        id: "overview",
        camera: { fit: "all" },
        text: {
          ...(story.overview.title ? { title: story.overview.title } : {}),
          ...(story.overview.body ? { body: story.overview.body } : {}),
        },
      }
    : null;

  const steps = overviewStep
    ? story.overview!.position === "last"
      ? [...narrated, overviewStep]
      : [overviewStep, ...narrated]
    : narrated;

  try {
    return NarrativeDocumentSchema.parse({
      version: 1,
      graph: { source: story.meta?.d2_source ?? "diagram.d2" },
      scenes: [
        {
          id: "main",
          layout: "two-pane",
          ...(story.meta?.title ? { text: { title: story.meta.title } } : {}),
          ...(story.detail_panels || story.edge_tooltips
            ? {
                annotations: {
                  ...(story.detail_panels ? { nodes: story.detail_panels } : {}),
                  ...(story.edge_tooltips ? { edges: story.edge_tooltips } : {}),
                },
              }
            : {}),
          steps,
        },
      ],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        "Invalid narrative document (converted from legacy story):\n" + z.prettifyError(err),
        { cause: err }
      );
    }
    throw err;
  }
}
