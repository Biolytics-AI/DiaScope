import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WasmD2Compiler } from "../src/compiler.js";
import { buildGraphIndex } from "../src/index-builder.js";
import { inspectGraph } from "../src/inspect.js";

const SRC = `
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
`;

describe("WasmD2Compiler", () => {
  it("compiles to svg + index with geometry", async () => {
    const { svg, index } = await new WasmD2Compiler().compile(SRC);
    expect(svg).toContain("<svg");
    const api = index.nodes.find((n) => n.id === "sys.api")!;
    expect(api.classes).toContain("svc");
    expect(api.parent).toBe("sys");
    expect(api.geometry!.width).toBeGreaterThan(0);
    expect(index.edges[0]).toMatchObject({ source: "request", target: "sys.api", label: "query" });
  }, 30_000);

  it("compiles the real vLLM example (elk layout via d2-config vars)", async () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../examples/vLLM/deployment.d2", import.meta.url)),
      "utf8",
    );
    const { index } = await new WasmD2Compiler().compile(src);
    expect(index.nodes.some((n) => n.id === "HealthcareProvider.Controls.ClientAuth")).toBe(true);
    expect(
      index.edges.some(
        (e) => e.source === "HealthcareProvider.Controls.ClientAuth" && e.target === "Biolytics.Runtime.Ingress",
      ),
    ).toBe(true);
  }, 60_000);

  it("throws a readable error on invalid d2", async () => {
    await expect(new WasmD2Compiler().compile("a -> ")).rejects.toThrow();
  }, 30_000);

  it("handles concurrent compiles without deadlocking", async () => {
    const SRC2 = `
db: Database { class: store }
worker: Worker
worker -> db: persist
`;
    const c = new WasmD2Compiler();
    const [a, b] = await Promise.all([c.compile(SRC), c.compile(SRC2)]);

    const api = a.index.nodes.find((n) => n.id === "sys.api")!;
    expect(api.parent).toBe("sys");
    expect(a.index.edges[0]).toMatchObject({ source: "request", target: "sys.api", label: "query" });

    const db = b.index.nodes.find((n) => n.id === "db")!;
    expect(db.classes).toContain("store");
    expect(b.index.edges[0]).toMatchObject({ source: "worker", target: "db", label: "persist" });
  }, 60_000);
});

describe("inspectGraph", () => {
  it("returns the index (same shape) for SRC", async () => {
    const index = await inspectGraph(SRC);
    const api = index.nodes.find((n) => n.id === "sys.api")!;
    expect(api).toBeDefined();
    expect(api.classes).toContain("svc");
    expect(api.parent).toBe("sys");
    expect(index.edges[0]).toMatchObject({ source: "request", target: "sys.api", label: "query" });
  }, 30_000);
});

describe("buildGraphIndex", () => {
  it("derives parent from dot-notation id, defaults classes to [], falls back label to id", () => {
    const diagram = {
      shapes: [
        { id: "sys", label: "System", classes: ["svc"], pos: { x: 0, y: 0 }, width: 100, height: 50 },
        { id: "sys.api", label: "", pos: { x: 10, y: 10 }, width: 40, height: 20 },
      ],
      connections: [{ id: "(sys -> sys.api)[0]", src: "sys", dst: "sys.api", label: "" }],
    };
    const index = buildGraphIndex(diagram);

    const sys = index.nodes.find((n) => n.id === "sys")!;
    expect(sys.parent).toBeNull();
    expect(sys.classes).toEqual(["svc"]);

    const api = index.nodes.find((n) => n.id === "sys.api")!;
    expect(api.parent).toBe("sys");
    expect(api.label).toBe("sys.api"); // falls back to id when label is empty
    expect(api.classes).toEqual([]); // defaults to [] when classes is missing

    expect(index.edges[0]).toEqual({ id: "(sys -> sys.api)[0]", source: "sys", target: "sys.api" }); // label omitted when falsy
  });
});
