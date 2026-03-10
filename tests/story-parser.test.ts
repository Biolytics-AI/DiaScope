import { describe, it, expect } from "vitest";
import { parseStoryFile } from "../src/story/parser.js";

describe("parseStoryFile", () => {
  it("parses a minimal valid story", () => {
    const yaml = `
steps:
  - id: step-01
    title: "Client sends request"
    nodes: [Client, Server]
`;
    const result = parseStoryFile(yaml);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.id).toBe("step-01");
    expect(result.steps[0]!.nodes).toEqual(["Client", "Server"]);
  });

  it("throws on missing steps key", () => {
    expect(() => parseStoryFile("meta:\n  title: foo")).toThrow(/steps/);
  });

  it("throws on step missing id", () => {
    const yaml = `steps:\n  - title: "No ID"`;
    expect(() => parseStoryFile(yaml)).toThrow(/id/);
  });

  it("throws on step missing title", () => {
    const yaml = `steps:\n  - id: s1`;
    expect(() => parseStoryFile(yaml)).toThrow(/title/);
  });

  it("parses detail_panels and edge_tooltips", () => {
    const yaml = `
steps:
  - id: s1
    title: T
detail_panels:
  Server: "<p>info</p>"
edge_tooltips:
  "sends to": "HTTP POST"
`;
    const result = parseStoryFile(yaml);
    expect(result.detail_panels?.["Server"]).toBe("<p>info</p>");
    expect(result.edge_tooltips?.["sends to"]).toBe("HTTP POST");
  });

  it("parses optional meta fields", () => {
    const yaml = `
meta:
  title: "My Story"
  d2_source: diagram.d2
steps:
  - id: s1
    title: T
`;
    const result = parseStoryFile(yaml);
    expect(result.meta?.title).toBe("My Story");
    expect(result.meta?.d2_source).toBe("diagram.d2");
  });
});
