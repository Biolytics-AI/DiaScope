import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphIndex, SceneState } from "@diascope/core";
import { SvgGraphBinding } from "@diascope/d2";
import { applyStateToSvg } from "./state-classes.js";
import { animateViewBox, fitViewBox } from "./camera.js";
import { runTraceAnimations, clearTraceStyles } from "./trace.js";

/**
 * Fits `svgEl`'s viewBox to the bounds of `state.cameraFit`, aspect-matched to `host`'s
 * current pixel size (16:9 fallback when unmeasured, e.g. under jsdom). Returns the
 * animation's cancel function, or null when the fit ids have no geometry.
 *
 * Exported so the camera fit used by GraphCanvas's state effect and its resize re-fit is
 * one shared, directly-testable code path.
 */
export function fitCameraToState(
  binding: SvgGraphBinding,
  svgEl: SVGSVGElement,
  host: HTMLElement,
  state: SceneState,
  ms?: number
): (() => void) | null {
  const bounds = binding.bounds(state.cameraFit);
  if (!bounds) return null;
  const aspect = host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 16 / 9;
  return animateViewBox(svgEl, fitViewBox(bounds, aspect), ms);
}

export interface GraphCanvasProps {
  svg: string;
  index: GraphIndex;
  state: SceneState;
  onNodeClick?: (id: string) => void;
  onEdgeHover?: (id: string | null, ev: MouseEvent) => void;
  onBindingReady?: (binding: SvgGraphBinding, svgEl: SVGSVGElement) => void;
}

/**
 * Hosts a compiled D2 SVG inline (so its ids/classes are part of the live DOM, not an
 * <img>/<object>), applies SceneState as CSS classes, animates the camera viewBox toward
 * state.cameraFit, runs trace-edge draw animations, and surfaces node clicks / edge hovers.
 *
 * The SVG is (re)parsed only when `svg` or `index` changes (host.innerHTML), so state
 * changes never tear down and rebuild the DOM — they only update classes in place, which
 * keeps the binding, the element identity used for hit-testing, and any in-flight CSS
 * transitions stable across steps.
 */
export function GraphCanvas({ svg, index, state, onNodeClick, onEdgeHover, onBindingReady }: GraphCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [binding, setBinding] = useState<SvgGraphBinding | null>(null);
  const svgElRef = useRef<SVGSVGElement | null>(null);
  const prevStateRef = useRef<SceneState | null>(null);
  const lastEdgeId = useRef<string | null>(null);
  const cancelFitRef = useRef<(() => void) | null>(null);

  // Single entry point for camera fits: cancels any in-flight animation before starting the
  // next one, so the state effect and the resize re-fit below never fight over the viewBox.
  const runCameraFit = useCallback(
    (state: SceneState, ms?: number) => {
      if (!binding || !svgElRef.current || !hostRef.current) return;
      cancelFitRef.current?.();
      cancelFitRef.current = fitCameraToState(binding, svgElRef.current, hostRef.current, state, ms);
    },
    [binding]
  );

  // Mount/replace the inline SVG whenever the compiled diagram itself changes.
  useEffect(() => {
    const host = hostRef.current!;
    host.innerHTML = svg;
    const svgEl = host.querySelector("svg");
    if (!svgEl) return;
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.style.width = "100%";
    svgEl.style.height = "100%";
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svgElRef.current = svgEl as SVGSVGElement;
    prevStateRef.current = null; // fresh DOM: nothing to clear trace styles from yet
    const b = new SvgGraphBinding(svgEl, index);
    setBinding(b);
    onBindingReady?.(b, svgEl as SVGSVGElement);
  }, [svg, index]);

  // Apply the resolved scene state, run trace animations, and animate the camera whenever
  // the state (or the binding it applies to) changes.
  useEffect(() => {
    if (!binding || !svgElRef.current) return;
    if (prevStateRef.current) clearTraceStyles(binding, prevStateRef.current);
    applyStateToSvg(binding, index, state);
    runTraceAnimations(binding, state);
    prevStateRef.current = state;

    runCameraFit(state);
    // Cleanup cancels any in-flight camera animation before the next state's animation
    // starts, so rapid step changes don't fight over the viewBox attribute.
    return () => {
      cancelFitRef.current?.();
      cancelFitRef.current = null;
    };
  }, [binding, index, state, runCameraFit]);

  // Re-fit the camera when the host's pixel size changes (e.g. reveal.js rescaling its
  // slides on every window resize): without this the viewBox computed for the old aspect
  // goes stale until the next step, while popover positioning already uses the new
  // geometry — visible misalignment. jsdom has no ResizeObserver, hence the guard.
  useEffect(() => {
    const host = hostRef.current;
    if (!binding || !host || typeof ResizeObserver === "undefined") return;
    let first = true;
    const ro = new ResizeObserver(() => {
      // ResizeObserver always fires once on observe(); the state effect has already
      // fitted for the current size, so only react to actual subsequent resizes.
      if (first) {
        first = false;
        return;
      }
      if (prevStateRef.current) runCameraFit(prevStateRef.current, 150);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [binding, runCameraFit]);

  // Hit-test clicks/hovers against an inverted element -> id map (built once per binding)
  // instead of walking the graph index per event.
  useEffect(() => {
    const host = hostRef.current;
    if (!binding || !host || (!onNodeClick && !onEdgeHover)) return;

    const elementToId = new Map<Element, { kind: "node" | "edge"; id: string }>();
    for (const n of index.nodes) {
      const el = binding.nodeElement(n.id);
      if (el) elementToId.set(el, { kind: "node", id: n.id });
    }
    for (const e of index.edges) {
      const el = binding.edgeElement(e.id);
      if (el) elementToId.set(el, { kind: "edge", id: e.id });
    }

    const lookup = (target: Element | null, kind: "node" | "edge"): string | null => {
      for (let el = target; el && el !== host; el = el.parentElement) {
        const hit = elementToId.get(el);
        if (hit && hit.kind === kind) return hit.id;
      }
      return null;
    };

    const click = (e: Event) => {
      const id = lookup(e.target as Element, "node");
      if (id) onNodeClick?.(id);
    };
    // Dedupe consecutive null hovers (e.g. moving across several non-edge elements in a
    // row): only the first null after a real edge id fires, so onEdgeHover isn't spammed
    // with redundant "nothing hovered" calls.
    const move = (e: Event) => {
      const id = lookup(e.target as Element, "edge");
      if (id === null && lastEdgeId.current === null) return;
      lastEdgeId.current = id;
      onEdgeHover?.(id, e as MouseEvent);
    };

    host.addEventListener("click", click);
    if (onEdgeHover) host.addEventListener("mousemove", move);
    return () => {
      host.removeEventListener("click", click);
      host.removeEventListener("mousemove", move);
    };
  }, [binding, index, onNodeClick, onEdgeHover]);

  return (
    <div
      ref={hostRef}
      data-diascope-part="canvas"
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    />
  );
}
