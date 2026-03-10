import yaml from "js-yaml";
import type { StoryFile, StoryStep } from "./types.js";

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

  return {
    meta: typeof raw["meta"] === "object" && raw["meta"] !== null
      ? (raw["meta"] as StoryFile["meta"])
      : undefined,
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
