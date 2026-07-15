import { useEffect, useRef, useState } from "react";
import type { GraphIndex, SceneState } from "@diascope/core";
import { SvgGraphBinding } from "@diascope/d2";
import { applyStateToSvg } from "./state-classes.js";
import { animateViewBox, fitViewBox } from "./camera.js";
import { runTraceAnimations, clearTraceStyles } from "./trace.js";

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

    const bounds = binding.bounds(state.cameraFit);
    if (!bounds) return;
    const host = hostRef.current!;
    const aspect = host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 16 / 9;
    // Cleanup cancels any in-flight camera animation before the next state's animation
    // starts, so rapid step changes don't fight over the viewBox attribute.
    return animateViewBox(svgElRef.current, fitViewBox(bounds, aspect));
  }, [binding, index, state]);

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
    const move = (e: Event) => onEdgeHover?.(lookup(e.target as Element, "edge"), e as MouseEvent);

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
