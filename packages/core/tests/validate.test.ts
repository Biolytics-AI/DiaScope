import { describe, it, expect } from "vitest";
import { validateDocument } from "../src/validate.js";
import { M1_RENDERED_VERBS, ALL_VERBS } from "../src/capabilities.js";
import { resolveStep, foldVisibility } from "../src/resolve.js";
import { resolveNodes } from "../src/selectors.js";
import type { NarrativeDocument, Step } from "../src/schema.js";
import type { GraphIndex } from "../src/graph.js";

const index: GraphIndex = {
  nodes: [
    { id: "request", label: "Request", classes: ["entry"], parent: null },
    { id: "sys", label: "System", classes: [], parent: null },
    { id: "sys.api", label: "API", classes: ["svc"], parent: "sys" },
    { id: "sys.db", label: "DB", classes: ["db"], parent: "sys" },
  ],
  edges: [
    { id: "(request -> sys.api)[0]", source: "request", target: "sys.api" },
    { id: "(request -> sys.api)[1]", source: "request", target: "sys.api", label: "retry" },
    { id: "(sys.api -> sys.db)[0]", source: "sys.api", target: "sys.db" },
  ],
};

function doc(steps: NarrativeDocument["scenes"][number]["steps"], extra?: Partial<NarrativeDocument["scenes"][number]>): NarrativeDocument {
  return {
    version: 1,
    graph: { source: "g.d2" },
    scenes: [{ id: "s1", layout: "two-pane", steps, ...extra }],
  };
}

describe("validateDocument", () => {
  it("reports no errors and no warnings for a fully valid doc", () => {
    const d = doc([
      {
        id: "st0",
        show: ["request", "sys.api", "sys.db"],
        focus: ["sys.api"],
        highlight: ["sys.api"],
        trace: "sys.api->sys.db",
        popover: { target: "sys.db", content: "hi" },
        camera: { fit: "selection" },
      },
    ]);
    const result = validateDocument(d, index);
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it("reports one error per unknown selector array element, with suggestions", () => {
    const d = doc([{ id: "st0", focus: ["sys.apo", "sys.dbx"] }]);
    const result = validateDocument(d, index);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].path).toBe("scenes[0].steps[0].focus[0]");
    expect(result.errors[1].path).toBe("scenes[0].steps[0].focus[1]");
    expect(result.errors[0].reason).toBe("unknown-reference");
    expect(result.errors[0].suggestions).toContain("sys.api");
  });

  it("distinguishes malformed trace syntax from an unknown edge reference", () => {
    const malformed = doc([{ id: "st0", trace: "request" }]);
    const rMalformed = validateDocument(malformed, index);
    expect(rMalformed.errors).toHaveLength(1);
    expect(rMalformed.errors[0].reason).toBe("invalid-trace");

    const missingEdge = doc([{ id: "st0", trace: "request->sys.db" }]);
    const rMissing = validateDocument(missingEdge, index);
    expect(rMissing.errors).toHaveLength(1);
    expect(rMissing.errors[0].reason).toBe("unknown-reference");
  });

  it("warns (not errors) when a class/not selector resolves to zero nodes", () => {
    const d = doc([{ id: "st0", dim: { class: "nonexistent" } }]);
    const result = validateDocument(d, index);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some(w => w.reason === "empty-selector")).toBe(true);
  });

  it("warns on deferred verbs (unsupported-verb), naming the verb in the message", () => {
    const d = doc([{ id: "st0", waitFor: "click" }]);
    const result = validateDocument(d, index);
    const w = result.warnings.find(w => w.reason === "unsupported-verb");
    expect(w).toBeDefined();
    expect(w!.message).toContain("waitFor");
  });

  it("warns when a trace hop resolves over parallel edges", () => {
    const d = doc([{ id: "st0", trace: "request->sys.api" }]);
    const result = validateDocument(d, index);
    expect(result.errors).toEqual([]);
    const w = result.warnings.find(w => w.reason === "ambiguous-edge");
    expect(w).toBeDefined();
    expect(w!.message).toContain("2");
  });

  it("warns hidden-emphasis when focus resolves only to hidden nodes", () => {
    const d = doc([
      { id: "st0", hide: ["sys.api"] },
      { id: "st1", focus: ["sys.api"] },
    ]);
    const result = validateDocument(d, index);
    const w = result.warnings.find(w => w.reason === "hidden-emphasis");
    expect(w).toBeDefined();
    expect(w!.path).toBe("scenes[0].steps[1].focus");
  });

  it("warns hidden-popover when a popover target is hidden at that step", () => {
    const d = doc([{ id: "st0", hide: ["sys.api"], popover: { target: "sys.api", content: "x" } }]);
    const result = validateDocument(d, index);
    const w = result.warnings.find(w => w.reason === "hidden-popover");
    expect(w).toBeDefined();
  });

  it("errors on annotations.nodes keyed by an unknown node id", () => {
    const d = doc([{ id: "st0" }], { annotations: { nodes: { "sys.apoz": "note" } } });
    const result = validateDocument(d, index);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe("unknown-reference");
    expect(result.errors[0].path).toBe("scenes[0].annotations.nodes.sys.apoz");
  });

  it("warns empty-selector per zero-match non-string array element", () => {
    const d = doc([{ id: "st0", focus: ["request", { class: "typo" }] }]);
    const result = validateDocument(d, index);
    expect(result.errors).toEqual([]);
    const empties = result.warnings.filter(w => w.reason === "empty-selector");
    expect(empties).toHaveLength(1);
    expect(empties[0].path).toBe("scenes[0].steps[0].focus[1]");
  });

  it("warns empty-selector once per zero-match element in an all-empty array", () => {
    const d = doc([{ id: "st0", focus: [{ class: "t1" }, { class: "t2" }] }]);
    const result = validateDocument(d, index);
    expect(result.errors).toEqual([]);
    const empties = result.warnings.filter(w => w.reason === "empty-selector");
    expect(empties.map(w => w.path)).toEqual([
      "scenes[0].steps[0].focus[0]",
      "scenes[0].steps[0].focus[1]",
    ]);
  });

  it("popover error paths mirror the authored shape: object form has no [i], array form does", () => {
    const single = doc([{ id: "st0", popover: { target: "nope", content: "x" } }]);
    const rSingle = validateDocument(single, index);
    expect(rSingle.errors).toHaveLength(1);
    expect(rSingle.errors[0].path).toBe("scenes[0].steps[0].popover.target");

    const arr = doc([{ id: "st0", popover: [{ target: "nope", content: "x" }] }]);
    const rArr = validateDocument(arr, index);
    expect(rArr.errors).toHaveLength(1);
    expect(rArr.errors[0].path).toBe("scenes[0].steps[0].popover[0].target");
  });

  it("errors on unknown camera.fit array element with exact path and suggestions", () => {
    const d = doc([{ id: "st0", camera: { fit: ["sys.apo"] } }]);
    const result = validateDocument(d, index);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe("scenes[0].steps[0].camera.fit[0]");
    expect(result.errors[0].reason).toBe("unknown-reference");
    expect(result.errors[0].suggestions).toContain("sys.api");
  });

  it("visibility fold parity: hidden-emphasis agrees with resolveStep visibility at every step", () => {
    const d = doc([
      { id: "st0", hide: ["sys.api"], focus: ["request"] },
      { id: "st1", show: ["sys.api"], focus: ["sys.api"] },
      { id: "st2", hide: ["sys.db"], focus: ["sys.db"] },
    ]);
    const result = validateDocument(d, index);
    d.scenes[0].steps.forEach((step, i) => {
      const visible = new Set(resolveStep(d, "s1", i, index).visible);
      const focusTarget = (step.focus as string[])[0];
      const warned = result.warnings.some(
        w => w.reason === "hidden-emphasis" && w.path === `scenes[0].steps[${i}].focus`
      );
      expect(warned).toBe(!visible.has(focusTarget));
    });
  });

  it("does not validate annotations.edges keys as node references", () => {
    const d = doc([{ id: "st0" }], { annotations: { edges: { "not-a-node-id": "note" } } });
    const result = validateDocument(d, index);
    expect(result.errors).toEqual([]);
  });
});

describe("foldVisibility", () => {
  const allIds = index.nodes.map(n => n.id).sort();

  it("seeds from all nodes when steps[0] has no show", () => {
    const steps: Step[] = [{ id: "s0" }];
    expect([...foldVisibility(steps, 0, index, resolveNodes)].sort()).toEqual(allIds);
  });

  it("seeds from empty when steps[0].show is present", () => {
    const steps: Step[] = [{ id: "s0", show: ["request"] }, { id: "s1", show: ["sys.api"] }];
    expect([...foldVisibility(steps, 0, index, resolveNodes)].sort()).toEqual(["request"]);
    expect([...foldVisibility(steps, 1, index, resolveNodes)].sort()).toEqual(["request", "sys.api"]);
  });

  it("folds show/hide cumulatively including the current step", () => {
    const steps: Step[] = [
      { id: "s0", hide: ["sys.api"] },
      { id: "s1", show: ["sys.api"], hide: ["sys.db"] },
    ];
    expect([...foldVisibility(steps, 0, index, resolveNodes)].sort()).toEqual(["request", "sys", "sys.db"]);
    expect([...foldVisibility(steps, 1, index, resolveNodes)].sort()).toEqual(["request", "sys", "sys.api"]);
  });
});

describe("capabilities", () => {
  it("M1_RENDERED_VERBS includes trace but not waitFor; ALL_VERBS includes both", () => {
    expect(M1_RENDERED_VERBS).toContain("trace");
    expect(M1_RENDERED_VERBS).not.toContain("waitFor");
    expect(ALL_VERBS).toContain("trace");
    expect(ALL_VERBS).toContain("waitFor");
  });
});
