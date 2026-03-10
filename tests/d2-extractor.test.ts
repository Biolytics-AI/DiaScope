import { describe, it, expect } from "vitest";
import { extractStepsFromD2 } from "../src/story/d2-extractor.js";

describe("extractStepsFromD2", () => {
  it("returns empty array when no @step annotations", () => {
    expect(extractStepsFromD2("Client -> Server")).toHaveLength(0);
  });

  it("extracts nodes from edge following @step annotation", () => {
    const d2 = `
# @step step-01
Client -> Server: sends to
`;
    const steps = extractStepsFromD2(d2);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.id).toBe("step-01");
    expect(steps[0]!.nodes).toContain("Client");
    expect(steps[0]!.nodes).toContain("Server");
  });

  it("handles multiple steps", () => {
    const d2 = `
# @step step-01
Client -> Server: sends to
# @step step-02
Server -> Database: queries
`;
    const steps = extractStepsFromD2(d2);
    expect(steps).toHaveLength(2);
    expect(steps[0]!.id).toBe("step-01");
    expect(steps[1]!.id).toBe("step-02");
    expect(steps[1]!.nodes).toContain("Server");
    expect(steps[1]!.nodes).toContain("Database");
  });

  it("ignores non-@step comments", () => {
    const d2 = `
# just a regular comment
# @step step-01
Client -> Server
`;
    const steps = extractStepsFromD2(d2);
    expect(steps).toHaveLength(1);
  });

  it("deduplicates nodes within a step", () => {
    const d2 = `
# @step step-01
Client -> Server: req
Client -> Server: retry
`;
    const steps = extractStepsFromD2(d2);
    const nodes = steps[0]!.nodes!;
    expect(nodes.filter((n) => n === "Client")).toHaveLength(1);
    expect(nodes.filter((n) => n === "Server")).toHaveLength(1);
  });

  it("sets step id as placeholder title", () => {
    const d2 = `# @step my-step\nA -> B`;
    const steps = extractStepsFromD2(d2);
    expect(steps[0]!.title).toBe("my-step");
  });
});
