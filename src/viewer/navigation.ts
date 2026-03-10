import { applyHighlight, autoZoom, type HighlightContext } from "./highlight.js";
import type { Step } from "./types.js";

export interface NavigationContext extends HighlightContext {
  selectors: { stepButtons: string; stepTag: string; stepTitle: string; stepBody: string; prevBtn: string; nextBtn: string; focusBtn: string };
  stepTagEl: HTMLElement | null;
  stepTitleEl: HTMLElement | null;
  stepBodyEl: HTMLElement | null;
  prevBtn: (HTMLButtonElement & { disabled: boolean }) | null;
  nextBtn: (HTMLButtonElement & { disabled: boolean }) | null;
  focusBtn: HTMLButtonElement | null;
  fitBtn: HTMLButtonElement | null;
  detailDrawerEl: HTMLElement | null;
  edgeTooltipEl: HTMLElement | null;
  onKeyDown: ((e: KeyboardEvent) => void) | null;
  hideTransientUI(): void;
}

export function goStep(viewer: NavigationContext, idx: number, btn: Element | null = null): void {
  if (!viewer.steps.length) return;
  const bounded = Math.max(0, Math.min(viewer.steps.length - 1, idx));
  viewer.curStep = bounded;
  const win = viewer.doc.defaultView;
  if (win) (win as Window & { curStep?: number }).curStep = bounded;

  const step: Step = viewer.steps[bounded]!;
  viewer.doc.querySelectorAll(viewer.selectors.stepButtons).forEach((b) => b.classList.remove("active"));
  const target = btn ?? viewer.doc.querySelector(`${viewer.selectors.stepButtons}[data-step="${bounded}"]`);
  if (target) target.classList.add("active");

  if (viewer.stepTagEl) viewer.stepTagEl.textContent = step.tag ?? "";
  if (viewer.stepTitleEl) viewer.stepTitleEl.textContent = step.title ?? "";
  if (viewer.stepBodyEl) viewer.stepBodyEl.innerHTML = step.body ?? "";

  viewer.hideTransientUI();
  applyHighlight(viewer, step.nodes ?? []);
  autoZoom(viewer, step.nodes ?? []);

  if (viewer.prevBtn) viewer.prevBtn.disabled = bounded === 0;
  if (viewer.nextBtn) viewer.nextBtn.disabled = bounded === viewer.steps.length - 1;
}

export function toggleFocus(viewer: NavigationContext): void {
  viewer.focusMode = !viewer.focusMode;
  if (viewer.focusBtn) {
    viewer.focusBtn.textContent = viewer.focusMode ? "○ Context" : "● Focus";
    viewer.focusBtn.title = viewer.focusMode
      ? "Context mode: full diagram, active nodes highlighted"
      : "Focus mode: only active nodes and edges shown";
  }
  applyHighlight(viewer, viewer.steps[viewer.curStep]?.nodes ?? []);
}

export function resetOverview(viewer: NavigationContext): void {
  viewer.focusMode = false;
  if (viewer.focusBtn) {
    viewer.focusBtn.textContent = "● Focus";
    viewer.focusBtn.title = "Toggle between Focus (only active nodes) and Context (everything, with highlights)";
  }
  viewer.hideTransientUI();
  goStep(viewer, 0, viewer.doc.querySelector(`${viewer.selectors.stepButtons}[data-step="0"]`));
  if (viewer.pz) { viewer.pz.fit(); viewer.pz.center(); }
}

export function bindKeyboard(viewer: NavigationContext): void {
  viewer.onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") goStep(viewer, viewer.curStep + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") goStep(viewer, viewer.curStep - 1);
  };
  viewer.doc.addEventListener("keydown", viewer.onKeyDown);
}
