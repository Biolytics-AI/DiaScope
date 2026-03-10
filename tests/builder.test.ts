import { describe, it, expect } from "vitest";
import { buildHtml } from "../src/cli/builder.js";
import type { StoryFile } from "../src/story/types.js";

const story: StoryFile = {
  meta: { title: "Test Story" },
  steps: [{ id: "s1", tag: "01", title: "First step", nodes: ["A"] }],
};

describe("buildHtml", () => {
  it("inlines SVG content", () => {
    const html = buildHtml("<svg><g id='A'/></svg>", story, { viewerBundlePath: "./d2-story-viewer.bundle.js" });
    expect(html).toContain("<svg>");
  });

  it("sets page title from meta", () => {
    const html = buildHtml("<svg/>", story, { viewerBundlePath: "./x.js" });
    expect(html).toContain("<title>Test Story</title>");
  });

  it("injects step buttons with tag labels", () => {
    const html = buildHtml("<svg/>", story, { viewerBundlePath: "./x.js" });
    expect(html).toContain('data-step="0"');
    expect(html).toContain("01");
  });

  it("injects viewer config JSON with steps and nodeIds", () => {
    const html = buildHtml("<svg/>", story, { viewerBundlePath: "./x.js" });
    expect(html).toContain('"title": "First step"');
    expect(html).toContain('"A"');
  });

  it("uses fallback title when meta is absent", () => {
    const noMeta: StoryFile = { steps: [{ id: "s1", title: "T" }] };
    const html = buildHtml("<svg/>", noMeta, { viewerBundlePath: "./x.js" });
    expect(html).toContain("<title>D2 Story</title>");
  });
});
