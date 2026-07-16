import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphIndex, NarrativeDocument } from "@diascope/core";
import { effectiveSteps, resolveStepInView } from "@diascope/core";
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
import { sceneLayout } from "./layout.js";
import {
  applyExploreOverlay,
  nextExploreTarget,
  drillBreadcrumb,
  INACTIVE_EXPLORE_STATE,
  type ExploreState,
} from "./explore.js";

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
 * step via @diascope/core's resolveStepInView (against the active audience lens) and wires
 * GraphCanvas's node-click/edge-hover events to the scene's `annotations` (drawer content for
 * nodes, tooltip text for edges).
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
  const [exploreState, setExploreState] = useState<ExploreState>(INACTIVE_EXPLORE_STATE);
  const [activeViewId, setActiveViewId] = useState("default");
  const isFirstStepRenderRef = useRef(true);

  // `scene` stays possibly-undefined until AFTER all hooks have run: an unknown sceneId
  // renders error UI below instead of throwing mid-render, and the hook count stays
  // consistent whether or not the scene exists.
  const scene = doc.scenes.find(s => s.id === sceneId);
  const state = useMemo(
    () => (scene ? resolveStepInView(doc, sceneId, activeViewId, stepIndex, index) : null),
    [doc, scene, sceneId, activeViewId, stepIndex, index]
  );

  // Nodes that open a drawer — handed to GraphCanvas so it can make exactly those elements
  // keyboard-focusable. Memoized so GraphCanvas's attribute effect doesn't churn each render.
  // While exploring, every node is a valid isolate/drill target, so the whole diagram becomes
  // clickable/focusable instead of just the authored-annotation subset.
  const interactiveNodeIds = useMemo(
    () => (exploreState.active ? index.nodes.map(n => n.id) : Object.keys(scene?.annotations?.nodes ?? {})),
    [exploreState.active, index, scene]
  );

  // The scene's audience lenses: an implicit "default" view plus any authored `views`, handed
  // to NarrativePane's tab row (Task 3). Always at least one entry, so a scene with no `views`
  // still produces a list — NarrativePane itself decides not to render a tab row when there's
  // only one choice.
  const views = useMemo(() => (scene ? effectiveSteps(scene) : []), [scene]);

  // Decided once per document from the diagram's true aspect (union of node geometry), so the
  // layout never thrashes between steps — see docs/superpowers/specs/2026-07-15-adaptive-layout-design.md.
  const layout = useMemo(() => sceneLayout(index), [index]);

  // Re-runs when `scene` presence flips (e.g. a doc update fixes a bad sceneId) so the
  // freshly-mounted valid root still registers; installLayoutDebug dedupes via a Set.
  useEffect(() => {
    if (rootRef.current) installLayoutDebug(rootRef.current);
  }, [scene]);

  // A new scene starts back on its own default lens rather than carrying over whichever view
  // id happened to be active for the previous scene (which may not even exist on this one).
  useEffect(() => {
    setActiveViewId("default");
  }, [sceneId]);

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

  // Explore mode is a client-side escape hatch scoped to the current step: leaving the step
  // (prev/next/pill click) should snap back to the authored view rather than carry an isolate/
  // drill target into a step it wasn't chosen on. Skip the very first render so mounting on a
  // given stepIndex doesn't immediately "auto-exit" state that was never entered.
  useEffect(() => {
    if (isFirstStepRenderRef.current) {
      isFirstStepRenderRef.current = false;
      return;
    }
    setExploreState(INACTIVE_EXPLORE_STATE);
  }, [stepIndex]);

  // Escape exits explore mode, mirroring the drawer's Escape handling below. The two are
  // mutually exclusive (explore mode routes node clicks away from setDrawer), so only one of
  // these two Escape listeners is ever registered at a time.
  useEffect(() => {
    if (!exploreState.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setExploreState(INACTIVE_EXPLORE_STATE);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [exploreState.active]);

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
      if (exploreState.active) {
        setExploreState(prev => ({ active: true, target: nextExploreTarget(id, prev.target, index) }));
        return;
      }
      if (scene?.annotations?.nodes?.[id]) setDrawer(id);
    },
    [exploreState.active, scene, index]
  );

  // Switching lenses resets to step 0 of the newly active view — a mid-narrative step index
  // from one lens rarely lines up meaningfully with another lens's own step sequence.
  const onLensChange = useCallback(
    (viewId: string) => {
      setActiveViewId(viewId);
      onGoto(0);
    },
    [onGoto]
  );

  const onEdgeHover = useCallback(
    (id: string | null, ev: MouseEvent) => {
      // Tooltips are step annotations, same as popovers/the drawer — suppressed while
      // exploring so a stale hover card can't sit over the neutral explore view.
      if (!id || exploreState.active) {
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
    [scene, index, exploreState.active]
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

  // Replaces the authored SceneState with a neutral, click-driven view while explore mode is
  // active; identity (returns `state` unchanged) when inactive, so the non-exploring render
  // path is untouched. See src/explore.ts.
  const renderedState = applyExploreOverlay(state, exploreState, index);

  // The narration pane must describe the SAME view the graph is showing. `state` (and thus the
  // diagram) already resolves against `activeViewId` via resolveStepInView; mirror that here so
  // the pane's title/body/pills follow the active lens instead of staying stuck on the default
  // view's steps. For the default lens `activeView.steps === scene.steps`, so this is a no-op.
  // stepIndex is clamped to the active view's step count — as resolveStepInView clamps it for
  // the graph — so a transient index left over from a longer view can't index past a shorter
  // view's steps for one render.
  const activeView = views.find(v => v.id === activeViewId) ?? views[0];
  const paneScene = { ...scene, steps: activeView.steps };
  const paneStepIndex = Math.min(Math.max(stepIndex, 0), activeView.steps.length - 1);

  return (
    <div ref={rootRef} data-diascope-part="scene" className="ds-scene" data-diascope-layout={layout}>
      <div className="ds-scene-inner">
      <div ref={canvasWrapRef} className="ds-canvas-wrap">
        <GraphCanvas
          svg={svg}
          index={index}
          state={renderedState}
          onNodeClick={onNodeClick}
          onEdgeHover={hasEdgeTips ? onEdgeHover : undefined}
          interactiveNodeIds={interactiveNodeIds}
          onBindingReady={(b, el) => {
            setBinding(b);
            setContentTransform(readContentTransform(el));
          }}
        />
        <div className="ds-explore-controls">
          <button
            type="button"
            className="ds-explore-toggle"
            aria-pressed={exploreState.active}
            onClick={() => {
              // A drawer left open when explore mode is toggled on would float, stale, over a
              // view that just reset to "everything visible" — always close it on entry (and
              // harmlessly no-op if none was open).
              setDrawer(null);
              setExploreState(prev => (prev.active ? INACTIVE_EXPLORE_STATE : { active: true, target: null }));
            }}
          >
            {exploreState.active ? "Exploring · Exit" : "Explore"}
          </button>
          {exploreState.active && exploreState.target?.kind === "drill" && (
            <nav data-diascope-part="drill-breadcrumb" className="ds-explore-breadcrumb" aria-label="Container path">
              {drillBreadcrumb(exploreState.target.containerId, index).map((id, i, arr) => (
                <button
                  key={id}
                  type="button"
                  className="ds-explore-crumb"
                  onClick={() => setExploreState({ active: true, target: { kind: "drill", containerId: id } })}
                >
                  {(index.nodes.find(n => n.id === id)?.label ?? id) + (i < arr.length - 1 ? " ›" : "")}
                </button>
              ))}
            </nav>
          )}
        </div>
        {/* Popovers are step annotations; the drawer is a focused dialog. Never show both —
            a card sliding under/next to the dialog reads as bleed-through. */}
        {!drawer && !exploreState.active && (
          <PopoverLayer
            popovers={state.popovers}
            binding={binding}
            viewBox={viewBox}
            container={containerSize}
            transform={contentTransform}
          />
        )}
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
      <NarrativePane
        scene={paneScene}
        stepIndex={paneStepIndex}
        onGoto={onGoto}
        views={views.map(v => ({ id: v.id, label: v.label }))}
        activeViewId={activeViewId}
        onLensChange={onLensChange}
      />
      </div>
    </div>
  );
}
