import { describe, it, expect } from "vitest";
import type { GraphIndex, SceneState } from "@diascope/core";
import {
  applyExploreOverlay,
  nextExploreTarget,
  drillBreadcrumb,
  INACTIVE_EXPLORE_STATE,
  type ExploreState,
} from "../src/explore.js";

const index: GraphIndex = {
  nodes: [
    { id: "sys", label: "System", classes: [], parent: null },
    { id: "sys.api", label: "API", classes: ["svc"], parent: "sys" },
    { id: "sys.db", label: "DB", classes: ["db"], parent: "sys" },
    { id: "request", label: "Request", classes: ["entry"], parent: null },
    { id: "lonely", label: "Lonely", classes: [], parent: null },
  ],
  edges: [
    { id: "(request -> sys.api)[0]", source: "request", target: "sys.api" },
    { id: "(sys.api -> sys.db)[0]", source: "sys.api", target: "sys.db" },
  ],
};

const authoredState: SceneState = {
  visible: ["sys", "sys.api", "sys.db", "request", "lonely"],
  highlighted: ["request"],
  dimmed: ["sys", "sys.db", "lonely"],
  traced: [],
  popovers: [{ target: "request", content: "hi" }],
  cameraFit: ["request"],
  text: { title: "Step title" },
};

describe("applyExploreOverlay", () => {
  it("inactive returns the authored state unchanged (identity)", () => {
    expect(applyExploreOverlay(authoredState, INACTIVE_EXPLORE_STATE, index)).toBe(authoredState);
  });

  it("active with no target: neutral base, all visible, nothing dimmed, camera fits all, keeps step text", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: null }, index);
    expect(s.visible.slice().sort()).toEqual(["lonely", "request", "sys", "sys.api", "sys.db"]);
    expect(s.highlighted).toEqual([]);
    expect(s.dimmed).toEqual([]);
    expect(s.popovers).toEqual([]);
    expect(s.cameraFit.slice().sort()).toEqual(["lonely", "request", "sys", "sys.api", "sys.db"]);
    expect(s.text).toEqual({ title: "Step title" });
  });

  it("isolate: highlights the node + neighbors, dims the rest, traces the connecting edges", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "isolate", nodeId: "sys.api" } }, index);
    expect(s.highlighted.slice().sort()).toEqual(["request", "sys.api", "sys.db"]);
    expect(s.dimmed.slice().sort()).toEqual(["lonely", "sys"]);
    expect(s.traced.map(e => e.id).slice().sort()).toEqual(["(request -> sys.api)[0]", "(sys.api -> sys.db)[0]"]);
    expect(s.cameraFit.slice().sort()).toEqual(["request", "sys.api", "sys.db"]);
  });

  it("isolate on a node with zero edges highlights only itself", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "isolate", nodeId: "lonely" } }, index);
    expect(s.highlighted).toEqual(["lonely"]);
    expect(s.traced).toEqual([]);
    expect(s.cameraFit).toEqual(["lonely"]);
  });

  it("drill: highlights the container + its children, dims the rest without hiding it", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "drill", containerId: "sys" } }, index);
    expect(s.highlighted.slice().sort()).toEqual(["sys", "sys.api", "sys.db"]);
    expect(s.dimmed.slice().sort()).toEqual(["lonely", "request"]);
    expect(s.visible.slice().sort()).toEqual(["lonely", "request", "sys", "sys.api", "sys.db"]);
    expect(s.cameraFit.slice().sort()).toEqual(["sys", "sys.api", "sys.db"]);
  });

  it("drilling into a childless id degrades to isolating it", () => {
    const s = applyExploreOverlay(authoredState, { active: true, target: { kind: "drill", containerId: "lonely" } }, index);
    expect(s.highlighted).toEqual(["lonely"]);
  });
});

describe("nextExploreTarget", () => {
  it("clicking a leaf isolates it", () => {
    expect(nextExploreTarget("request", null, index)).toEqual({ kind: "isolate", nodeId: "request" });
  });
  it("clicking a container drills into it", () => {
    expect(nextExploreTarget("sys", null, index)).toEqual({ kind: "drill", containerId: "sys" });
  });
  it("clicking the currently-drilled container again zooms back out", () => {
    expect(nextExploreTarget("sys", { kind: "drill", containerId: "sys" }, index)).toBeNull();
  });
  it("clicking the currently-isolated node again is a no-op", () => {
    const current: ExploreState["target"] = { kind: "isolate", nodeId: "request" };
    expect(nextExploreTarget("request", current, index)).toBe(current);
  });
  it("clicking an unrelated container while mid-drill replaces the target", () => {
    expect(nextExploreTarget("sys", { kind: "isolate", nodeId: "request" }, index)).toEqual({ kind: "drill", containerId: "sys" });
  });
});

describe("drillBreadcrumb", () => {
  it("root container: single-element chain", () => {
    expect(drillBreadcrumb("sys", index)).toEqual(["sys"]);
  });
  it("nested container: root-to-leaf ancestor chain", () => {
    expect(drillBreadcrumb("sys.api", index)).toEqual(["sys", "sys.api"]);
  });
  it("unknown id: empty array", () => {
    expect(drillBreadcrumb("nope", index)).toEqual([]);
  });
});
