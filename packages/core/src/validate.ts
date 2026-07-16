import type { GraphIndex } from "./graph.js";
import type { NarrativeDocument, NodeSelector, Popover, Step } from "./schema.js";
import { resolveNodes, resolveTrace, UnknownReferenceError } from "./selectors.js";
import { foldVisibility } from "./resolve.js";
import { DEFERRED_VERBS } from "./capabilities.js";

// Tolerant show/hide resolver for the visibility fold: iterates array elements
// individually and skips unknown references instead of throwing, so the fold
// keeps the same partial-resolution semantics as per-element validation. The
// unknown refs themselves are reported as errors by resolveSelectorVerb.
function tolerantResolve(sel: NodeSelector | NodeSelector[] | undefined, index: GraphIndex): string[] {
  if (sel === undefined) return [];
  const parts = Array.isArray(sel) ? sel : [sel];
  const out: string[] = [];
  for (const s of parts) {
    try {
      out.push(...resolveNodes(s, index));
    } catch (e) {
      if (!(e instanceof UnknownReferenceError)) throw e;
    }
  }
  return out;
}

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

  // Warns "empty-selector" for a class/not selector that resolved to zero nodes. String
  // selectors never warn here: an unknown string id already errored (unknown-reference) and a
  // known one always resolves to exactly one node.
  function warnIfEmpty(sel: NodeSelector, resolved: string[], path: string) {
    if (resolved.length === 0 && typeof sel !== "string") {
      warnings.push({ path, reason: "empty-selector", message: `Selector at ${path} matches no nodes` });
    }
  }

  // Resolves a show/hide/focus/highlight/dim (or camera.fit array) value. Arrays are resolved
  // element-by-element so every bad element is reported at its exact index (`path[i]`), and each
  // zero-match class/not element gets its own "empty-selector" warning.
  function resolveSelectorVerb(value: NodeSelector | NodeSelector[] | undefined, path: string): string[] {
    if (value === undefined) return [];
    if (Array.isArray(value)) {
      const out: string[] = [];
      value.forEach((el, i) => {
        const elPath = `${path}[${i}]`;
        const r = resolveOne(el, elPath);
        if (r === undefined) return;
        warnIfEmpty(el, r, elPath);
        out.push(...r);
      });
      return out;
    }
    const r = resolveOne(value, path);
    if (r === undefined) return [];
    warnIfEmpty(value, r, path);
    return r;
  }

  function validateTrace(trace: Step["trace"], path: string, visible: ReadonlySet<string>) {
    if (trace === undefined) return;
    const specs = Array.isArray(trace) ? trace : [trace];
    const isArray = Array.isArray(trace);
    specs.forEach((spec, i) => {
      const specPath = isArray ? `${path}[${i}]` : path;
      try {
        const edges = resolveTrace(spec, index);
        // Mirrors hidden-emphasis/hidden-popover: the renderer marks any edge touching a
        // hidden node as hidden, so a traced edge with a hidden endpoint never shows.
        for (const edge of edges) {
          if (!visible.has(edge.source) || !visible.has(edge.target)) {
            warnings.push({
              path: specPath,
              reason: "hidden-trace",
              message: `trace edge "${edge.source} -> ${edge.target}" has a hidden endpoint and will not be visible at this step`,
            });
          }
        }
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
    const isArray = Array.isArray(popover);
    const items = isArray ? popover : [popover];
    items.forEach((p, i) => {
      // Paths mirror the authored shape: `popover.target` for the single-object form,
      // `popover[i].target` only when the author actually wrote an array.
      const targetPath = isArray ? `${path}[${i}].target` : `${path}.target`;
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

  // Validates one step array (a scene's own `steps`, or an authored view's `steps`) against
  // `stepsPath`, the path prefix under which per-step issues are reported (e.g.
  // "scenes[0].steps" or "scenes[0].views[1].steps"). Extracted so both the scene's default
  // step array and every authored view's step array run through identical validation logic.
  function validateSteps(steps: Step[], stepsPath: string): void {
    for (let ti = 0; ti < steps.length; ti++) {
      const step = steps[ti];
      const stepPath = `${stepsPath}[${ti}]`;

      // Reference/empty checks for show/hide happen here (once per step, exact paths);
      // the visibility itself comes from the same fold resolveStep uses, with a tolerant
      // resolver so already-reported unknown refs don't abort the fold.
      resolveSelectorVerb(step.show, `${stepPath}.show`);
      resolveSelectorVerb(step.hide, `${stepPath}.hide`);
      const visible = foldVisibility(steps, ti, index, tolerantResolve);

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

      validateTrace(step.trace, `${stepPath}.trace`, visible);
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
  }

  for (let si = 0; si < doc.scenes.length; si++) {
    const scene = doc.scenes[si];
    const scenePath = `scenes[${si}]`;

    // Default view keeps today's scenes[i].steps[...] path shape for backward compatibility;
    // authored views validate independently with scenes[i].views[j].steps[...] paths (j indexes
    // scene.views directly, not effectiveSteps' prepended list, so it matches what the author wrote).
    validateSteps(scene.steps, `${scenePath}.steps`);
    (scene.views ?? []).forEach((view, vi) => {
      validateSteps(view.steps, `${scenePath}.views[${vi}].steps`);
    });

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
