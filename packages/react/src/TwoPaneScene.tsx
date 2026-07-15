import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphIndex, NarrativeDocument } from "@diascope/core";
import { resolveStep } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";
import { GraphCanvas } from "./GraphCanvas.js";
import { PopoverLayer } from "./PopoverLayer.js";
import { NarrativePane } from "./NarrativePane.js";
import { installLayoutDebug } from "./debug.js";
import { fitViewBox, type ViewBox } from "./camera.js";

export interface TwoPaneSceneProps {
  svg: string;
  index: GraphIndex;
  doc: NarrativeDocument;
  sceneId: string;
  stepIndex: number;
  onGoto: (i: number) => void;
}

/**
 * The classic DiaScope layout: diagram + popovers on the left, narration pane on the right,
 * plus a node-detail drawer and edge tooltips layered over the canvas. Resolves the current
 * step via @diascope/core's resolveStep and wires GraphCanvas's node-click/edge-hover events
 * to the scene's `annotations` (drawer content for nodes, tooltip text for edges).
 */
export function TwoPaneScene({ svg, index, doc, sceneId, stepIndex, onGoto }: TwoPaneSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [binding, setBinding] = useState<SvgGraphBinding | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  const state = useMemo(() => resolveStep(doc, sceneId, stepIndex, index), [doc, sceneId, stepIndex, index]);

  useEffect(() => {
    if (rootRef.current) installLayoutDebug(rootRef.current);
  }, []);

  // Track the canvas wrapper's pixel size so PopoverLayer can convert diagram-space bounds
  // to screen coordinates. Under jsdom (unit tests) getBoundingClientRect always returns an
  // all-zero rect; we still record that zero-size object (rather than null) so popovers and
  // the viewBox still render deterministically in tests — only their pixel *position* is
  // meaningless there, which Task 17's Playwright pass verifies against a real browser.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      setContainerSize({ width: b.width, height: b.height });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const viewBox: ViewBox | null = useMemo(() => {
    if (!binding || !containerSize) return null;
    const bounds = binding.bounds(state.cameraFit);
    if (!bounds) return null;
    // Fall back to a 16:9 aspect (matches GraphCanvas's own fallback) when the container
    // hasn't been measured with real pixels yet, so this never divides by zero / produces NaN.
    const aspect = containerSize.width && containerSize.height ? containerSize.width / containerSize.height : 16 / 9;
    return fitViewBox(bounds, aspect);
  }, [binding, containerSize, state]);

  const onNodeClick = useCallback(
    (id: string) => {
      if (scene.annotations?.nodes?.[id]) setDrawer(id);
    },
    [scene]
  );

  const onEdgeHover = useCallback(
    (id: string | null, ev: MouseEvent) => {
      if (!id) {
        setTooltip(null);
        return;
      }
      const edge = index.edges.find(e => e.id === id);
      const tips = scene.annotations?.edges ?? {};
      const text = (edge?.label && tips[edge.label]) || (edge && tips[`${edge.source}->${edge.target}`]) || null;
      setTooltip(text && edge ? { text, x: ev.clientX, y: ev.clientY } : null);
    },
    [scene, index]
  );

  const hasEdgeTips = !!scene.annotations?.edges && Object.keys(scene.annotations.edges).length > 0;

  return (
    <div ref={rootRef} data-diascope-part="scene" className="ds-scene">
      <div ref={canvasWrapRef} className="ds-canvas-wrap">
        <GraphCanvas
          svg={svg}
          index={index}
          state={state}
          onNodeClick={onNodeClick}
          onEdgeHover={hasEdgeTips ? onEdgeHover : undefined}
          onBindingReady={b => setBinding(b)}
        />
        <PopoverLayer popovers={state.popovers} binding={binding} viewBox={viewBox} container={containerSize} />
        {tooltip && (
          <div
            data-diascope-part="tooltip"
            className="ds-tooltip"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
      <NarrativePane scene={scene} stepIndex={stepIndex} onGoto={onGoto} />
      {drawer && scene.annotations?.nodes?.[drawer] && (
        <div data-diascope-part="drawer" className="ds-drawer" role="dialog" aria-label={`Details for ${drawer}`}>
          <header className="ds-drawer-header">
            <code>{drawer}</code>
            <button type="button" aria-label="Close details" onClick={() => setDrawer(null)}>
              ×
            </button>
          </header>
          <div dangerouslySetInnerHTML={{ __html: scene.annotations.nodes[drawer] }} />
        </div>
      )}
    </div>
  );
}
