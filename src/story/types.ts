/**
 * Root structure of a .story.yaml narration file.
 *
 * LLM PATCH NOTES:
 * - To add a step: append to `steps[]`, set `id`, `title`, `nodes`.
 * - To edit narration: update `title` or `body` in the relevant step.
 * - To add a detail panel: add entry to `detail_panels` keyed by D2 node ID.
 * - `nodes` values MUST match D2 source node names exactly (case-sensitive).
 * - Nested D2 nodes use dot notation: "System.Client"
 */
export interface StoryFile {
  meta?: StoryMeta;
  steps: StoryStep[];
  detail_panels?: Record<string, string>;
  edge_tooltips?: Record<string, string>;
}

export interface StoryMeta {
  title?: string;
  description?: string;
  /** Path to the .d2 source file, relative to this .story.yaml */
  d2_source?: string;
}

export interface StoryStep {
  /**
   * Stable identifier — used to match against `# @step <id>` comments in .d2.
   * Snake-case recommended. Example: "step-01"
   */
  id: string;
  /** Short label shown in step pill UI. Example: "01" */
  tag?: string;
  /** Headline for this step */
  title: string;
  /** Body text or HTML rendered in the narration panel */
  body?: string;
  /**
   * D2 node IDs to highlight.
   * Must match node names in the .d2 file exactly.
   * Use dot notation for nested nodes: "Container.Child"
   */
  nodes?: string[];
}
