import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { storyToViewerOptions } from "../story/adapter.js";
import type { StoryFile } from "../story/types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
// Templates live at package root /templates/, two levels up from dist/cli/
const TEMPLATE_PATH = join(__dir, "../../templates/story.html");

export interface BuildOptions {
  viewerBundlePath: string;
}

export function buildHtml(
  svgContent: string,
  story: StoryFile,
  options: BuildOptions
): string {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const viewerOptions = storyToViewerOptions(story);
  const title = story.meta?.title ?? "D2 Story";

  const stepButtons = (viewerOptions.steps ?? [])
    .map(
      (s, i) =>
        `<button class="step-btn" data-step="${i}">${escapeHtml(s.tag ?? String(i + 1))}</button>`
    )
    .join("\n");

  return template
    .replace("{{META_TITLE}}", escapeHtml(title))
    .replace("{{SVG_CONTENT}}", svgContent)
    .replace("{{STEP_BUTTONS}}", stepButtons)
    .replace("{{VIEWER_BUNDLE_PATH}}", options.viewerBundlePath)
    .replace("{{VIEWER_CONFIG_JSON}}", JSON.stringify(viewerOptions, null, 2));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
