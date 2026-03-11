import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { storyToViewerOptions } from "../story/adapter.js";
import type { StoryFile } from "../story/types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
// Templates live at package root /templates/, two levels up from dist/cli/
const TEMPLATE_PATH = join(__dir, "../../templates/story.html");

export interface BuildOptions {
  viewerRuntime: RuntimeScript;
  svgPanZoomRuntime: RuntimeScript;
}

export interface RuntimeScript {
  type: "inline" | "external";
  value: string;
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
    .replace("{{SVG_PAN_ZOOM_SCRIPT_TAG}}", renderScriptTag(options.svgPanZoomRuntime))
    .replace("{{VIEWER_RUNTIME_SCRIPT_TAG}}", renderScriptTag(options.viewerRuntime))
    .replace("{{VIEWER_CONFIG_JSON}}", JSON.stringify(viewerOptions, null, 2));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderScriptTag(runtime: RuntimeScript): string {
  if (runtime.type === "external") {
    return `<script src="${escapeAttribute(runtime.value)}"></script>`;
  }
  return `<script>${escapeInlineScript(runtime.value)}</script>`;
}

function escapeAttribute(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeInlineScript(s: string): string {
  return s.replace(/<\/script/gi, "<\\/script");
}
