import yaml from "js-yaml";
import type { StoryFile, StoryOverview, StoryStep } from "./types.js";

export function parseStoryFile(content: string): StoryFile {
  const raw = yaml.load(content) as Record<string, unknown>;

  if (!raw || typeof raw !== "object") {
    throw new Error("Story file must be a YAML object");
  }
  if (!Array.isArray(raw["steps"])) {
    throw new Error("Story file must have a 'steps' array");
  }

  const steps: StoryStep[] = (raw["steps"] as unknown[]).map((s: unknown, i: number) => {
    if (!s || typeof s !== "object") {
      throw new Error(`Step ${i} is not an object`);
    }
    const step = s as Record<string, unknown>;
    if (typeof step["id"] !== "string" || !step["id"]) {
      throw new Error(`Step ${i} is missing required field 'id'`);
    }
    if (typeof step["title"] !== "string" || !step["title"]) {
      throw new Error(`Step ${i} (id: ${step["id"]}) is missing required field 'title'`);
    }
    return {
      id: step["id"] as string,
      tag: typeof step["tag"] === "string" ? step["tag"] : undefined,
      title: step["title"] as string,
      body: typeof step["body"] === "string" ? step["body"] : undefined,
      nodes: Array.isArray(step["nodes"])
        ? (step["nodes"] as unknown[]).map((n) => String(n))
        : undefined,
    };
  });

  let overview: StoryOverview | undefined;
  if (typeof raw["overview"] === "object" && raw["overview"] !== null) {
    const ov = raw["overview"] as Record<string, unknown>;
    overview = {
      position: ov["position"] === "last" ? "last" : "first",
      title: typeof ov["title"] === "string" ? ov["title"] : undefined,
      body: typeof ov["body"] === "string" ? ov["body"] : undefined,
    };
  }

  let meta: StoryFile["meta"] | undefined;
  if (typeof raw["meta"] === "object" && raw["meta"] !== null) {
    const m = raw["meta"] as Record<string, unknown>;
    meta = {
      title: typeof m["title"] === "string" ? m["title"] : undefined,
      description: typeof m["description"] === "string" ? m["description"] : undefined,
      d2_source: typeof m["d2_source"] === "string" ? m["d2_source"] : undefined,
      d2_theme: typeof m["d2_theme"] === "number" ? m["d2_theme"] : undefined,
    };
  }

  return {
    meta,
    overview,
    steps,
    detail_panels:
      typeof raw["detail_panels"] === "object" && raw["detail_panels"] !== null
        ? (raw["detail_panels"] as Record<string, string>)
        : undefined,
    edge_tooltips:
      typeof raw["edge_tooltips"] === "object" && raw["edge_tooltips"] !== null
        ? (raw["edge_tooltips"] as Record<string, string>)
        : undefined,
  };
}
