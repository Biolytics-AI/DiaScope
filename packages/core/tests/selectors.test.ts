import { describe, it, expect } from "vitest";
import { resolveNodes, resolveTrace, UnknownReferenceError } from "../src/selectors.js";
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
    { id: "(sys.api -> sys.db)[0]", source: "sys.api", target: "sys.db" },
  ],
};

describe("resolveNodes", () => {
  it("resolves ids, classes, not, arrays", () => {
    expect(resolveNodes("sys.api", index)).toEqual(["sys.api"]);
    expect(resolveNodes({ class: "svc" }, index)).toEqual(["sys.api"]);
    expect(resolveNodes({ not: { class: "svc" } }, index)).toEqual(["request", "sys", "sys.db"]);
    expect(resolveNodes(["request", { class: "db" }], index)).toEqual(["request", "sys.db"]);
  });
  it("returns [] for undefined", () => {
    expect(resolveNodes(undefined, index)).toEqual([]);
  });
  it("dedupes across array members", () => {
    expect(resolveNodes(["sys.api", { class: "svc" }], index)).toEqual(["sys.api"]);
  });
  it("throws with suggestion on unknown id", () => {
    try { resolveNodes("sys.apo", index); throw new Error("no throw"); }
    catch (e) {
      expect(e).toBeInstanceOf(UnknownReferenceError);
      expect((e as UnknownReferenceError).suggestions).toContain("sys.api");
    }
  });
});

describe("resolveTrace", () => {
  it("expands paths into consecutive edges", () => {
    const edges = resolveTrace("request->sys.api->sys.db", index);
    expect(edges.map(e => e.id)).toEqual(["(request -> sys.api)[0]", "(sys.api -> sys.db)[0]"]);
  });
  it("accepts arrays of trace specs and tolerates spaces around arrows", () => {
    const edges = resolveTrace(["request -> sys.api", "sys.api->sys.db"], index);
    expect(edges).toHaveLength(2);
  });
  it("returns [] for undefined", () => {
    expect(resolveTrace(undefined, index)).toEqual([]);
  });
  it("throws on missing edge with suggestions", () => {
    expect(() => resolveTrace("request->sys.db", index)).toThrow(UnknownReferenceError);
  });
  it("throws on unknown hop node", () => {
    expect(() => resolveTrace("request->sys.apo", index)).toThrow(UnknownReferenceError);
  });
});
