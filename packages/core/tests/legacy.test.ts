import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { fromLegacyStory, type LegacyStory } from "../src/legacy.js";
import { NarrativeDocumentSchema } from "../src/schema.js";

const FIXTURE_URL = new URL(
  "../../../examples/vLLM/deployment.story.yaml",
  import.meta.url
);

function loadFixture(): LegacyStory {
  const text = readFileSync(FIXTURE_URL, "utf8");
  return yaml.load(text) as LegacyStory;
}

describe("fromLegacyStory: real vLLM example", () => {
  const story = loadFixture();
  const doc = fromLegacyStory(story);

  it("produces one scene with id 'main' and layout 'two-pane'", () => {
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0].id).toBe("main");
    expect(doc.scenes[0].layout).toBe("two-pane");
  });

  it("places the overview step LAST (legacy position: last), fit-to-all, correct title", () => {
    const scene = doc.scenes[0];
    const last = scene.steps[scene.steps.length - 1];
    expect(last.id).toBe("overview");
    expect(last.camera).toEqual({ fit: "all" });
    expect(last.text?.title).toBe("Compliant GPU Blueprint");
  });

  it("has step count = legacy steps + 1 (overview)", () => {
    expect(doc.scenes[0].steps).toHaveLength(story.steps.length + 1);
  });

  it("converts the first legacy step correctly", () => {
    const first = doc.scenes[0].steps[0];
    const legacyFirst = story.steps[0];
    expect(first.id).toBe("boundary-handoff");
    expect(first.text?.title).toBe(legacyFirst.title);
    expect(first.highlight).toEqual(legacyFirst.nodes);
    expect(first.camera).toEqual({ fit: "selection" });
  });

  it("carries detail_panels into annotations.nodes", () => {
    expect(doc.scenes[0].annotations?.nodes?.["Biolytics.Runtime.Ingress"]).toBe(
      story.detail_panels!["Biolytics.Runtime.Ingress"]
    );
  });

  it("carries edge_tooltips verbatim into annotations.edges", () => {
    expect(
      doc.scenes[0].annotations?.edges?.["authenticated request carrying clinical context"]
    ).toBe(story.edge_tooltips!["authenticated request carrying clinical context"]);
  });

  it("passes NarrativeDocumentSchema.parse and has the right graph source", () => {
    expect(() => NarrativeDocumentSchema.parse(doc)).not.toThrow();
    expect(doc.graph.source).toBe("deployment.d2");
  });
});

describe("fromLegacyStory: synthetic minimal stories", () => {
  it("overview position 'first' puts the overview step FIRST", () => {
    const story: LegacyStory = {
      overview: { position: "first", title: "All" },
      steps: [{ id: "s1", title: "Step one" }],
    };
    const doc = fromLegacyStory(story);
    expect(doc.scenes[0].steps[0].id).toBe("overview");
    expect(doc.scenes[0].steps[1].id).toBe("s1");
  });

  it("overview position omitted defaults to FIRST", () => {
    const story: LegacyStory = {
      overview: { title: "All" },
      steps: [{ id: "s1", title: "Step one" }],
    };
    const doc = fromLegacyStory(story);
    expect(doc.scenes[0].steps[0].id).toBe("overview");
    expect(doc.scenes[0].steps[1].id).toBe("s1");
  });

  it("steps without nodes produce text-only steps (no highlight/camera)", () => {
    const story: LegacyStory = {
      steps: [{ id: "s1", title: "Step one", body: "body text" }],
    };
    const doc = fromLegacyStory(story);
    const step = doc.scenes[0].steps[0];
    expect(step).toEqual({ id: "s1", text: { title: "Step one", body: "body text" } });
    expect(step.highlight).toBeUndefined();
    expect(step.camera).toBeUndefined();
  });

  it("a story with no overview produces no overview step", () => {
    const story: LegacyStory = {
      steps: [{ id: "s1", title: "Step one" }],
    };
    const doc = fromLegacyStory(story);
    expect(doc.scenes[0].steps).toHaveLength(1);
    expect(doc.scenes[0].steps.some(s => s.id === "overview")).toBe(false);
  });

  it("a story with no detail_panels/edge_tooltips produces a scene WITHOUT an annotations key", () => {
    const story: LegacyStory = {
      steps: [{ id: "s1", title: "Step one" }],
    };
    const doc = fromLegacyStory(story);
    expect("annotations" in doc.scenes[0]).toBe(false);
  });

  it("throws a readable error (not raw Zod JSON) for an invalid conversion result", () => {
    try {
      fromLegacyStory({ steps: [] });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Invalid narrative document");
      expect((err as Error).message).not.toContain('"code":');
    }
  });
});
