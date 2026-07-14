import { applyHighlight, autoZoom, type HighlightContext } from "./highlight.js";
import type { Step } from "./types.js";

/**
 * Convert plain-text body (YAML block scalar) to HTML paragraphs.
 * If the string already contains HTML tags, it is returned as-is.
 * Double newlines become paragraph breaks; single newlines become spaces.
 */
export function renderBody(text: string): string {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text; // already HTML
  return "<p>" + text.trim().split(/\n{2,}/).map(p => p.trim().replace(/\n/g, " ")).join("</p><p>") + "</p>";
}

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
  overview?: { position?: 'first' | 'last'; title?: string; body?: string };
  showOverview(btn?: Element | null): void;
  hideTransientUI(): void;
}

export function goStep(viewer: NavigationContext, idx: number, btn: Element | null = null): void {
  if (!viewer.steps.length) return;

  // Route to overview when navigating past the boundary (if configured)
  const overviewAtFirst = !!viewer.overview && viewer.overview.position !== 'last';
  const overviewAtLast = !!viewer.overview && viewer.overview.position === 'last';
  if (idx < 0 && overviewAtFirst) { viewer.showOverview(); return; }
  if (idx >= viewer.steps.length && overviewAtLast) { viewer.showOverview(); return; }

  const bounded = Math.max(0, Math.min(viewer.steps.length - 1, idx));
  viewer.curStep = bounded;
  const win = viewer.doc.defaultView;
  if (win) (win as Window & { curStep?: number }).curStep = bounded;

  // Exit overview-mode CSS class when returning to a numbered step
  viewer.doc.querySelector("#story-shell")?.classList.remove("overview-mode");

  const step: Step = viewer.steps[bounded]!;
  viewer.doc.querySelectorAll(viewer.selectors.stepButtons).forEach((b) => b.classList.remove("active"));
  const target = btn ?? viewer.doc.querySelector(`${viewer.selectors.stepButtons}[data-step="${bounded}"]`);
  if (target) target.classList.add("active");

  if (viewer.stepTagEl) viewer.stepTagEl.textContent = step.tag ?? "";
  if (viewer.stepTitleEl) viewer.stepTitleEl.textContent = step.title ?? "";
  if (viewer.stepBodyEl) viewer.stepBodyEl.innerHTML = renderBody(step.body ?? "");

  viewer.hideTransientUI();
  applyHighlight(viewer, step.nodes ?? []);
  autoZoom(viewer, step.nodes ?? []);

  // prevBtn disabled at step 0 unless overview is at 'first' (user can go back to All)
  if (viewer.prevBtn) viewer.prevBtn.disabled = bounded === 0 && !overviewAtFirst;
  // nextBtn disabled at last step unless overview is at 'last' (user can advance to All)
  if (viewer.nextBtn) viewer.nextBtn.disabled = bounded === viewer.steps.length - 1 && !overviewAtLast;
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
    const overviewAtFirst = !!viewer.overview && viewer.overview.position !== 'last';
    const overviewAtLast = !!viewer.overview && viewer.overview.position === 'last';

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (viewer.curStep === -1) {
        // From overview: go to first or last step depending on position
        goStep(viewer, overviewAtFirst ? 0 : viewer.steps.length - 1);
      } else {
        goStep(viewer, viewer.curStep + 1); // goStep handles routing to overview if at last+overviewAtLast
      }
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (viewer.curStep === -1) {
        // From overview: if position=last, go to last step; if position=first, do nothing (leftmost)
        if (overviewAtLast) goStep(viewer, viewer.steps.length - 1);
      } else {
        goStep(viewer, viewer.curStep - 1); // goStep handles routing to overview if at 0+overviewAtFirst
      }
    }
  };
  viewer.doc.addEventListener("keydown", viewer.onKeyDown);
}
