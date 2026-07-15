import type { Popover } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";
import {
  diagramToScreen,
  applyContentTransform,
  IDENTITY_CONTENT_TRANSFORM,
  type ViewBox,
  type ContentTransform,
} from "./camera.js";

export interface PopoverLayerProps {
  popovers: Popover[];
  binding: SvgGraphBinding | null;
  viewBox: ViewBox | null;
  container: { width: number; height: number } | null;
  /** Maps binding.bounds (D2 inner content space) into the outer svg user space `viewBox` lives in. */
  transform?: ContentTransform;
}

const CARD_WIDTH = 260;

/**
 * Renders each active popover as an absolutely-positioned card next to its target node,
 * converting the target's diagram-space bounds to screen pixels via the current camera
 * viewBox. Flips to the target's left when there isn't room to the right, and clamps
 * vertically to stay within the container.
 */
export function PopoverLayer({ popovers, binding, viewBox, container, transform }: PopoverLayerProps) {
  if (!binding || !viewBox || !container || popovers.length === 0) return null;
  const t = transform ?? IDENTITY_CONTENT_TRANSFORM;

  return (
    <div className="ds-popover-layer">
      {popovers.map((pop, i) => {
        const bounds = binding.bounds([pop.target]);
        if (!bounds) return null;
        // Map the node's inner-space bounds into the outer svg user space before projecting to
        // screen, matching the (transformed) viewBox — otherwise the card drifts by D2's pad.
        const r = diagramToScreen(applyContentTransform(bounds, t), viewBox, container);
        const fitsRight = r.x + r.width + 12 + CARD_WIDTH <= container.width;
        const left = fitsRight ? r.x + r.width + 12 : Math.max(8, r.x - CARD_WIDTH - 12);
        const top = Math.min(Math.max(8, r.y), Math.max(8, container.height - 120));
        return (
          <div
            key={`${pop.target}-${i}`}
            className="ds-popover"
            data-diascope-part="popover"
            data-diascope-target={pop.target}
            style={{ left, top, width: CARD_WIDTH }}
          >
            {pop.content}
          </div>
        );
      })}
    </div>
  );
}
