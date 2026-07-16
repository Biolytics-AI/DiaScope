import { useCallback, useEffect, useRef, useState } from "react";
import { Fragment, useReveal } from "@revealjs/react";
import type { NarrativeDocument } from "@diascope/core";
import type { D2Compiler } from "@diascope/d2";
import { TwoPaneScene, useNarrative } from "@diascope/react";
import { clampStep, countVisibleMarkers } from "./step-sync.js";

export interface NarrativeSceneProps {
  d2Source: string;
  doc: NarrativeDocument;
  sceneId: string;
  compiler?: D2Compiler;
}

const REVEAL_EVENTS = ["fragmentshown", "fragmenthidden", "slidechanged", "ready"] as const;

/**
 * The reveal.js host adapter: reveal.js owns navigation/presenter/URL state via fragments,
 * DiaScope owns graph state. A scene's N steps render N-1 invisible fragment marker spans
 * (one per step after step 0); the current step is derived purely from how many markers
 * reveal.js has toggled `visible` on (see step-sync.ts), so forward and backward navigation
 * both just recompute state rather than tracking a delta.
 *
 * `compiler` is accepted (and passed straight through to useNarrative, whose default param
 * kicks in when it's undefined) purely so tests can inject a controllable D2Compiler.
 */
export function NarrativeScene({ d2Source, doc, sceneId, compiler }: NarrativeSceneProps) {
  const reveal = useReveal();
  const { ready, svg, index, error } = useNarrative(d2Source, compiler);
  const [stepIndex, setStepIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const scene = doc.scenes.find(s => s.id === sceneId);
  const stepCount = scene?.steps.length ?? 0;

  useEffect(() => {
    if (!reveal) return;
    const update = () => setStepIndex(clampStep(countVisibleMarkers(rootRef.current), stepCount));
    for (const e of REVEAL_EVENTS) reveal.on(e, update);
    update();
    return () => {
      for (const e of REVEAL_EVENTS) reveal.off(e, update);
    };
  }, [reveal, stepCount]);

  const goto = useCallback(
    (i: number) => {
      const target = clampStep(i, stepCount);
      if (!reveal) {
        setStepIndex(target);
        return;
      }
      const { h, v } = reveal.getIndices();
      // Fragment index -1 == step 0 (no fragments shown yet); target N's marker is the
      // (N-1)th fragment since step 0 has no marker of its own.
      reveal.slide(h, v, target - 1);
    },
    [reveal, stepCount]
  );

  return (
    <div ref={rootRef} className="diascope-scene" style={{ width: "100%", height: "100%" }}>
      {error && (
        <pre className="diascope-error" style={{ color: "#f66", whiteSpace: "pre-wrap" }}>
          {error.message}
        </pre>
      )}
      {ready && index ? (
        <TwoPaneScene svg={svg} index={index} doc={doc} sceneId={sceneId} stepIndex={stepIndex} onGoto={goto} />
      ) : (
        !error && <p className="diascope-loading">Compiling diagram…</p>
      )}
      {scene?.steps.slice(1).map((s, i) => (
        <Fragment asChild index={i} key={s.id ?? i}>
          <span
            className="diascope-step-marker"
            data-diascope-step={i + 1}
            aria-hidden="true"
            style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
          />
        </Fragment>
      ))}
    </div>
  );
}
