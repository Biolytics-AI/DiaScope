import type { Scene } from "@diascope/core";

export interface NarrativePaneProps {
  scene: Scene;
  stepIndex: number;
  onGoto: (i: number) => void;
}

/**
 * The right-hand narration pane: a pill row for jumping directly to any step, the current
 * step's title/body, and prev/next controls. Step text falls back to the scene's own
 * text when a step doesn't set its own (e.g. a scene-level intro title carried across steps
 * that don't override it).
 */
export function NarrativePane({ scene, stepIndex, onGoto }: NarrativePaneProps) {
  const step = scene.steps[stepIndex];
  const title = step.text?.title ?? scene.text?.title ?? "";
  const body = step.text?.body ?? "";

  return (
    <aside data-diascope-part="pane" className="ds-pane">
      <nav data-diascope-part="pill-row" className="ds-pills" aria-label="Steps">
        {scene.steps.map((s, i) => (
          <button
            key={s.id ?? i}
            type="button"
            className={`ds-pill${i === stepIndex ? " ds-pill-active" : ""}`}
            aria-current={i === stepIndex ? "step" : undefined}
            title={s.text?.title ?? scene.text?.title ?? undefined}
            onClick={() => onGoto(i)}
          >
            {String(i + 1).padStart(2, "0")}
          </button>
        ))}
      </nav>
      <h2 className="ds-title">{title}</h2>
      <div className="ds-body" dangerouslySetInnerHTML={{ __html: body }} />
      <div className="ds-nav">
        <button
          type="button"
          aria-label="Previous step"
          disabled={stepIndex === 0}
          onClick={() => onGoto(stepIndex - 1)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Next step"
          disabled={stepIndex === scene.steps.length - 1}
          onClick={() => onGoto(stepIndex + 1)}
        >
          →
        </button>
      </div>
    </aside>
  );
}
