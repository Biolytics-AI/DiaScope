import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = new URL("../docs-site/src/content/docs/examples/vllm-deployment.mdx", import.meta.url);

describe("docs example page", () => {
  const source = readFileSync(pagePath, "utf8");

  it("uses the compliant GPU blueprint title and hides the page TOC", () => {
    expect(source).toContain('title: Compliant GPU Blueprint');
    expect(source).toContain("tableOfContents: false");
  });

  it("places the example section before the rest of the walkthrough content", () => {
    const exampleHeading = source.indexOf("## Example");
    const walkthroughHeading = source.indexOf("## What the walkthrough covers");
    expect(exampleHeading).toBeGreaterThan(-1);
    expect(walkthroughHeading).toBeGreaterThan(exampleHeading);
  });

  it("adds a page-specific pop-out control for the standalone example", () => {
    expect(source).toContain("docs-story-popout");
    expect(source).toContain('href="/examples/vllm/deployment.html"');
  });
});
