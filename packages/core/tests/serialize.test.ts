import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadDocument, canonicalYaml } from "../src/serialize.js";
import { NarrativeDocumentSchema, type NarrativeDocument } from "../src/schema.js";

const schemaPath = fileURLToPath(new URL("../schema/narrative.schema.json", import.meta.url));

const sampleYaml = `
version: 1
graph:
  source: ./arch.d2
scenes:
  - id: overview
    steps:
      - id: s0
        focus: a
        camera:
          fit: all
`;

const sampleDoc: NarrativeDocument = {
  version: 1,
  graph: { source: "./arch.d2" },
  scenes: [
    {
      id: "overview",
      layout: "two-pane",
      steps: [
        { id: "s0", focus: "a", camera: { fit: "all" } },
        { id: "s1", highlight: ["a", "b"], dim: { not: { class: "svc" } } },
      ],
    },
  ],
};

describe("loadDocument", () => {
  it("parses a small YAML doc and schema-validates, defaulting scene layout", () => {
    const doc = loadDocument(sampleYaml);
    expect(doc.scenes[0].layout).toBe("two-pane");
    expect(doc.version).toBe(1);
    expect(doc.graph.source).toBe("./arch.d2");
  });

  it("throws on schema-invalid YAML", () => {
    const bad = sampleYaml.replace("version: 1", "version: 2");
    expect(() => loadDocument(bad)).toThrow();
  });

  it("throws on non-object YAML", () => {
    expect(() => loadDocument("just a string")).toThrow();
  });

  it("wraps schema errors into a readable message", () => {
    const bad = sampleYaml.replace("version: 1", "version: 2");
    let caught: unknown;
    try {
      loadDocument(bad);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("Invalid narrative document");
    expect(message).toContain("version");
    expect(message).not.toContain('"code":');
  });
});

describe("canonicalYaml", () => {
  it("is idempotent (byte-identical on round-trip)", () => {
    const once = canonicalYaml(sampleDoc);
    const twice = canonicalYaml(loadDocument(once));
    expect(twice).toBe(once);
  });

  it("orders top-level keys: version, graph, scenes", () => {
    const text = canonicalYaml(sampleDoc);
    expect(text.indexOf("version")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("version")).toBeLessThan(text.indexOf("graph"));
    expect(text.indexOf("graph")).toBeLessThan(text.indexOf("scenes"));
  });

  it("orders step keys: id, focus, camera", () => {
    const text = canonicalYaml(sampleDoc);
    const idIdx = text.indexOf("id: s0");
    const focusIdx = text.indexOf("focus:");
    const cameraIdx = text.indexOf("camera:");
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeLessThan(focusIdx);
    expect(focusIdx).toBeLessThan(cameraIdx);
  });
});

describe("JSON Schema artifact", () => {
  it("exists, is valid JSON, and has the expected shape", () => {
    const raw = readFileSync(schemaPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.$defs).toBeTruthy();
    expect(parsed.$defs.NodeSelector).toBeTruthy();
    expect(Object.keys(parsed.properties)).toEqual(
      expect.arrayContaining(["version", "graph", "scenes"])
    );
  });

  it("matches the schema generated from src (drift guard)", () => {
    const generated = z.toJSONSchema(NarrativeDocumentSchema, { io: "input" });
    const committed = JSON.parse(readFileSync(schemaPath, "utf-8"));
    expect(generated).toEqual(committed);
  });
});
