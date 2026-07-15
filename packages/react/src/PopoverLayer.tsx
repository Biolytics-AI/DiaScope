import type { Popover } from "@diascope/core";
import type { SvgGraphBinding } from "@diascope/d2";
import { diagramToScreen, type ViewBox } from "./camera.js";

export interface PopoverLayerProps {
  popovers: Popover[];
  binding: SvgGraphBinding | null;
  viewBox: ViewBox | null;
  container: { width: number; height: number } | null;
}

const CARD_WIDTH = 260;

/**
 * Renders each active popover as an absolutely-positioned card next to its target node,
 * converting the target's diagram-space bounds to screen pixels via the current camera
 * viewBox. Flips to the target's left when there isn't room to the right, and clamps
 * vertically to stay within the container.
 */
export function PopoverLayer({ popovers, binding, viewBox, container }: PopoverLayerProps) {
  if (!binding || !viewBox || !container || popovers.length === 0) return null;

  return (
    <div className="ds-popover-layer">
      {popovers.map((pop, i) => {
        const bounds = binding.bounds([pop.target]);
        if (!bounds) return null;
        const r = diagramToScreen(bounds, viewBox, container);
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
