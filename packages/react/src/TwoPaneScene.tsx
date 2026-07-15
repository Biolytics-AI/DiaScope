import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphIndex, NarrativeDocument } from "@diascope/core";
import { resolveStep } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";
import { GraphCanvas } from "./GraphCanvas.js";
import { PopoverLayer } from "./PopoverLayer.js";
import { NarrativePane } from "./NarrativePane.js";
import { installLayoutDebug } from "./debug.js";
import {
  fitViewBox,
  readContentTransform,
  applyContentTransform,
  IDENTITY_CONTENT_TRANSFORM,
  type ViewBox,
  type ContentTransform,
} from "./camera.js";

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [binding, setBinding] = useState<SvgGraphBinding | null>(null);
  const [contentTransform, setContentTransform] = useState<ContentTransform>(IDENTITY_CONTENT_TRANSFORM);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  // `scene` stays possibly-undefined until AFTER all hooks have run: an unknown sceneId
  // renders error UI below instead of throwing mid-render, and the hook count stays
  // consistent whether or not the scene exists.
  const scene = doc.scenes.find(s => s.id === sceneId);
  const state = useMemo(
    () => (scene ? resolveStep(doc, sceneId, stepIndex, index) : null),
    [doc, scene, sceneId, stepIndex, index]
  );

  // Nodes that open a drawer — handed to GraphCanvas so it can make exactly those elements
  // keyboard-focusable. Memoized so GraphCanvas's attribute effect doesn't churn each render.
  const interactiveNodeIds = useMemo(() => Object.keys(scene?.annotations?.nodes ?? {}), [scene]);

  // Re-runs when `scene` presence flips (e.g. a doc update fixes a bad sceneId) so the
  // freshly-mounted valid root still registers; installLayoutDebug dedupes via a Set.
  useEffect(() => {
    if (rootRef.current) installLayoutDebug(rootRef.current);
  }, [scene]);

  // Track the canvas wrapper's pixel size so PopoverLayer can convert diagram-space bounds
  // to screen coordinates. We use offsetWidth/offsetHeight (the UNTRANSFORMED layout size)
  // rather than getBoundingClientRect (which returns TRANSFORMED sizes): inside reveal.js the
  // deck is CSS-transform-scaled, but the popover's absolute left/top live in the wrap's
  // untransformed local coordinate system, so positions must be computed in that same space
  // and then scaled along with the wrap. GraphCanvas's camera aspect already uses
  // clientWidth/clientHeight (also untransformed), so the two stay consistent.
  //
  // Under jsdom (unit tests) offsetWidth/offsetHeight are 0; we still record that zero-size
  // object (rather than null) so popovers and the viewBox still render deterministically in
  // tests — only their pixel *position* is meaningless there, which Task 17's Playwright pass
  // verifies against a real browser.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const measure = () => {
      setContainerSize({ width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Drawer dialog focus management: on open, remember what had focus and move it to the close
  // button; Escape closes; on close (cleanup) focus returns to the element that opened it — so
  // a keyboard user is never stranded. Escape is captured so it closes the drawer instead of
  // bubbling to reveal.js's own Escape (slide overview) handler.
  useEffect(() => {
    if (!drawer) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDrawer(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      lastFocusedRef.current?.focus?.();
    };
  }, [drawer]);

  const viewBox: ViewBox | null = useMemo(() => {
    if (!binding || !containerSize || !state) return null;
    const bounds = binding.bounds(state.cameraFit);
    if (!bounds) return null;
    // Map from D2's inner content space into the outer svg user space (same transform
    // GraphCanvas applies when it sets the actual viewBox), so this viewBox — which
    // PopoverLayer uses to place cards — matches where the nodes really render.
    const outerBounds = applyContentTransform(bounds, contentTransform);
    // Fall back to a 16:9 aspect (matches GraphCanvas's own fallback) when the container
    // hasn't been measured with real pixels yet, so this never divides by zero / produces NaN.
    const aspect = containerSize.width && containerSize.height ? containerSize.width / containerSize.height : 16 / 9;
    return fitViewBox(outerBounds, aspect);
  }, [binding, containerSize, state, contentTransform]);

  const onNodeClick = useCallback(
    (id: string) => {
      if (scene?.annotations?.nodes?.[id]) setDrawer(id);
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
      const tips = scene?.annotations?.edges ?? {};
      const text = (edge?.label && tips[edge.label]) || (edge && tips[`${edge.source}->${edge.target}`]) || null;
      if (!text || !edge) {
        setTooltip(null);
        return;
      }
      // Convert viewport (client) coordinates to the canvas wrap's UNTRANSFORMED local space.
      // The tooltip is positioned absolutely inside that wrap, which reveal.js transform-scales;
      // position:fixed with raw client coords would resolve against the transformed ancestor's
      // box (a transform creates a containing block for fixed descendants), not the viewport,
      // and drift. Dividing by the wrap's scale (rect.width / offsetWidth) undoes the transform.
      const wrap = canvasWrapRef.current;
      if (!wrap) {
        setTooltip({ text, x: ev.clientX, y: ev.clientY });
        return;
      }
      const r = wrap.getBoundingClientRect();
      const scale = wrap.offsetWidth ? r.width / wrap.offsetWidth : 1;
      setTooltip({ text, x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale });
    },
    [scene, index]
  );

  const edgeTips = scene?.annotations?.edges;
  const hasEdgeTips = !!edgeTips && Object.keys(edgeTips).length > 0;

  if (!scene || !state) {
    return (
      <div ref={rootRef} data-diascope-part="scene-error" className="ds-scene-error">
        Unknown scene "{sceneId}"
      </div>
    );
  }

  return (
    <div ref={rootRef} data-diascope-part="scene" className="ds-scene">
      <div className="ds-scene-inner">
      <div ref={canvasWrapRef} className="ds-canvas-wrap">
        <GraphCanvas
          svg={svg}
          index={index}
          state={state}
          onNodeClick={onNodeClick}
          onEdgeHover={hasEdgeTips ? onEdgeHover : undefined}
          interactiveNodeIds={interactiveNodeIds}
          onBindingReady={(b, el) => {
            setBinding(b);
            setContentTransform(readContentTransform(el));
          }}
        />
        <PopoverLayer
          popovers={state.popovers}
          binding={binding}
          viewBox={viewBox}
          container={containerSize}
          transform={contentTransform}
        />
        {tooltip && (
          <div
            data-diascope-part="tooltip"
            className="ds-tooltip"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            {tooltip.text}
          </div>
        )}
        {/* Drawer lives inside the canvas wrap so it slides over the diagram only and never
            overlaps the narration pane (which sits to the wrap's right). */}
        {drawer && scene.annotations?.nodes?.[drawer] && (
          <div
            data-diascope-part="drawer"
            className="ds-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Details for ${drawer}`}
          >
            <header className="ds-drawer-header">
              <code>{drawer}</code>
              <button ref={closeButtonRef} type="button" aria-label="Close details" onClick={() => setDrawer(null)}>
                ×
              </button>
            </header>
            <div dangerouslySetInnerHTML={{ __html: scene.annotations.nodes[drawer] }} />
          </div>
        )}
      </div>
      <NarrativePane scene={scene} stepIndex={stepIndex} onGoto={onGoto} />
      </div>
    </div>
  );
}
