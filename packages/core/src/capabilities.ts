export const M1_RENDERED_VERBS = ["show", "hide", "focus", "highlight", "dim", "trace", "popover", "camera"] as const;
export const DEFERRED_VERBS = ["annotate", "waitFor", "compare", "isolate", "expand", "collapse"] as const;
export const ALL_VERBS = [...M1_RENDERED_VERBS, ...DEFERRED_VERBS] as const;

export type M1RenderedVerb = (typeof M1_RENDERED_VERBS)[number];
export type DeferredVerb = (typeof DEFERRED_VERBS)[number];
export type Verb = (typeof ALL_VERBS)[number];
