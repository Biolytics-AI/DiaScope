/**
 * Root structure of a .story.yaml narration file.
 *
 * LLM PATCH NOTES:
 * - To add a step: append to `steps[]`, set `id`, `title`, `nodes`.
 * - To edit narration: update `title` or `body` in the relevant step.
 * - To add a detail panel: add entry to `detail_panels` keyed by D2 node ID.
 * - `nodes` values MUST match D2 source node names exactly (case-sensitive).
 * - Nested D2 nodes use dot notation: "System.Client"
 * - To add an "All" overview pill: add an `overview` block (see StoryOverview).
 */
export interface StoryFile {
  meta?: StoryMeta;
  /**
   * Optional "All" overview that shows the full unfiltered diagram.
   * When present, an "All" pill is added to the step nav.
   *
   * Example:
   * ```yaml
   * overview:
   *   position: first   # 'first' (default) or 'last'
   *   title: "System overview"
   *   body: "This diagram shows the full data pipeline."
   * ```
   */
  overview?: StoryOverview;
  steps: StoryStep[];
  detail_panels?: Record<string, string>;
  edge_tooltips?: Record<string, string>;
}

/**
 * Configuration for the optional "All" overview pill in the step nav.
 * When active, all highlights are cleared and the diagram is fit to view.
 */
export interface StoryOverview {
  /**
   * Where to place the "All" pill in the step nav.
   * - `'first'` (default): before step 1. Viewer starts at "All". Pressing ← from step 1 returns to All.
   * - `'last'`: after the last step. Viewer starts at step 1. Pressing → from the last step advances to All.
   */
  position?: 'first' | 'last';
  /**
   * Optional headline shown in the narration panel when All is active.
   * If omitted (along with `body`), the narration panel collapses to nav-only while All is active.
   */
  title?: string;
  /**
   * Optional body text or HTML shown in the narration panel when All is active.
   * If omitted (along with `title`), the narration panel collapses to nav-only while All is active.
   */
  body?: string;
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
