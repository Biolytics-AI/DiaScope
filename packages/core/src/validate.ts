import type { GraphIndex } from "./graph.js";
import type { NarrativeDocument, NodeSelector, Popover, Step } from "./schema.js";
import { resolveNodes, resolveTrace, UnknownReferenceError } from "./selectors.js";
import { DEFERRED_VERBS } from "./capabilities.js";

export interface Issue {
  path: string;
  message: string;
  reason: string;
  suggestions?: string[];
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

export function validateDocument(doc: NarrativeDocument, index: GraphIndex): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  // Converts a caught UnknownReferenceError into an Issue at `path`, preserving suggestions.
  // Reused by both plain-selector resolution and trace resolution: kind "trace" means malformed
  // trace syntax (invalid-trace); kinds "node"/"edge" mean a reference that doesn't exist
  // (unknown-reference).
  function toIssue(e: UnknownReferenceError, path: string): Issue {
    return {
      path,
      message: e.message,
      reason: e.kind === "trace" ? "invalid-trace" : "unknown-reference",
      suggestions: e.suggestions.length ? e.suggestions : undefined,
    };
  }

  // Resolves a single selector (never an array — array elements are resolved one at a time by
  // the caller so a bad element doesn't hide sibling errors). On failure, records an error Issue
  // and returns undefined instead of throwing.
  function resolveOne(sel: NodeSelector, path: string): string[] | undefined {
    try {
      return resolveNodes(sel, index);
    } catch (e) {
      if (e instanceof UnknownReferenceError) {
        errors.push(toIssue(e, path));
        return undefined;
      }
      throw e;
    }
  }

  // Resolves a show/hide/focus/highlight/dim (or camera.fit array) value. Arrays are resolved
  // element-by-element so every bad element is reported; a non-array class/not selector that
  // resolves to zero nodes is flagged as an "empty-selector" warning (arrays are not, per-element,
  // since an array of individually-valid selectors legitimately unioning to nothing isn't a typo
  // the way a single dead selector usually is).
  function resolveSelectorVerb(value: NodeSelector | NodeSelector[] | undefined, path: string): string[] {
    if (value === undefined) return [];
    if (Array.isArray(value)) {
      const out: string[] = [];
      value.forEach((el, i) => {
        const r = resolveOne(el, `${path}[${i}]`);
        if (r) out.push(...r);
      });
      return out;
    }
    const r = resolveOne(value, path);
    if (r === undefined) return [];
    if (r.length === 0 && typeof value !== "string") {
      warnings.push({ path, reason: "empty-selector", message: `Selector at ${path} matches no nodes` });
    }
    return r;
  }

  function validateTrace(trace: Step["trace"], path: string) {
    if (trace === undefined) return;
    const specs = Array.isArray(trace) ? trace : [trace];
    const isArray = Array.isArray(trace);
    specs.forEach((spec, i) => {
      const specPath = isArray ? `${path}[${i}]` : path;
      try {
        resolveTrace(spec, index);
        const hops = spec.split("->").map(s => s.trim()).filter(Boolean);
        for (let h = 0; h < hops.length - 1; h++) {
          const a = hops[h], b = hops[h + 1];
          const count = index.edges.filter(e => e.source === a && e.target === b).length;
          if (count > 1) {
            warnings.push({
              path: specPath,
              reason: "ambiguous-edge",
              message: `${count} parallel edges from "${a}" to "${b}" — the first (declared) edge is used`,
            });
          }
        }
      } catch (e) {
        if (e instanceof UnknownReferenceError) errors.push(toIssue(e, specPath));
        else throw e;
      }
    });
  }

  function validatePopover(popover: Popover | Popover[] | undefined, path: string, visible: ReadonlySet<string>) {
    if (popover === undefined) return;
    const items = Array.isArray(popover) ? popover : [popover];
    items.forEach((p, i) => {
      const targetPath = `${path}[${i}].target`;
      const r = resolveOne(p.target, targetPath);
      if (r !== undefined && !visible.has(p.target)) {
        warnings.push({
          path: targetPath,
          reason: "hidden-popover",
          message: `popover target "${p.target}" is not visible at this step`,
        });
      }
    });
  }

  for (let si = 0; si < doc.scenes.length; si++) {
    const scene = doc.scenes[si];
    const scenePath = `scenes[${si}]`;

    const visible = new Set<string>(scene.steps[0]?.show ? [] : index.nodes.map(n => n.id));
    for (let ti = 0; ti < scene.steps.length; ti++) {
      const step = scene.steps[ti];
      const stepPath = `${scenePath}.steps[${ti}]`;

      for (const id of resolveSelectorVerb(step.show, `${stepPath}.show`)) visible.add(id);
      for (const id of resolveSelectorVerb(step.hide, `${stepPath}.hide`)) visible.delete(id);

      const focusIds = resolveSelectorVerb(step.focus, `${stepPath}.focus`);
      if (focusIds.length > 0 && !focusIds.some(id => visible.has(id))) {
        warnings.push({
          path: `${stepPath}.focus`,
          reason: "hidden-emphasis",
          message: `focus at ${stepPath}.focus resolves only to nodes that are hidden at this step`,
        });
      }

      const highlightIds = resolveSelectorVerb(step.highlight, `${stepPath}.highlight`);
      if (highlightIds.length > 0 && !highlightIds.some(id => visible.has(id))) {
        warnings.push({
          path: `${stepPath}.highlight`,
          reason: "hidden-emphasis",
          message: `highlight at ${stepPath}.highlight resolves only to nodes that are hidden at this step`,
        });
      }

      resolveSelectorVerb(step.dim, `${stepPath}.dim`);

      validateTrace(step.trace, `${stepPath}.trace`);
      validatePopover(step.popover, `${stepPath}.popover`, visible);

      if (step.camera && Array.isArray(step.camera.fit)) {
        resolveSelectorVerb(step.camera.fit, `${stepPath}.camera.fit`);
      }

      for (const verb of DEFERRED_VERBS) {
        if (step[verb] !== undefined) {
          warnings.push({
            path: `${stepPath}.${verb}`,
            reason: "unsupported-verb",
            message: `"${verb}" is validated but not rendered in M1`,
          });
        }
      }
    }

    // annotations.nodes keys must be real node ids. annotations.edges keys match by edge label
    // or "source->target" at render time, not node ids — they aren't validatable here, so skip.
    if (scene.annotations?.nodes) {
      for (const key of Object.keys(scene.annotations.nodes)) {
        resolveOne(key, `${scenePath}.annotations.nodes.${key}`);
      }
    }
  }

  return { errors, warnings };
}
