import { describe, it, expect, vi, afterEach } from "vitest";
import { fitViewBox, interpolateRect, easeInOut, diagramToScreen, animateViewBox } from "../src/camera.js";

describe("fitViewBox", () => {
  it("pads and letterboxes to aspect", () => {
    const vb = fitViewBox({ x: 0, y: 0, width: 100, height: 50 }, 2, 0.1);
    expect(vb.width / vb.height).toBeCloseTo(2);
    expect(vb.x).toBeLessThan(0);
    expect(vb.x + vb.width).toBeGreaterThan(100);
  });
  it("expands the narrow dimension symmetrically", () => {
    const vb = fitViewBox({ x: 0, y: 0, width: 100, height: 100 }, 2, 0);
    expect(vb.width).toBeCloseTo(200);
    expect(vb.x).toBeCloseTo(-50);
    expect(vb.height).toBeCloseTo(100);
  });
});

describe("interpolateRect/easeInOut", () => {
  it("interpolates linearly at t", () => {
    const r = interpolateRect({ x: 0, y: 0, width: 0, height: 0 }, { x: 10, y: 20, width: 30, height: 40 }, 0.5);
    expect(r).toEqual({ x: 5, y: 10, width: 15, height: 20 });
  });
  it("easeInOut is monotonic with fixed endpoints", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    let prev = 0;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const v = easeInOut(Math.min(t, 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("diagramToScreen", () => {
  it("maps rects under xMidYMid meet (uniform case)", () => {
    const r = diagramToScreen(
      { x: 10, y: 10, width: 10, height: 10 },
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 200, height: 200 }
    );
    expect(r).toEqual({ x: 20, y: 20, width: 20, height: 20 });
  });
  it("centers the letterboxed axis", () => {
    const r = diagramToScreen(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 300, height: 200 }
    );
    expect(r.width).toBeCloseTo(200);
    expect(r.x).toBeCloseTo(50); // (300-200)/2
  });
});

describe("animateViewBox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeSvg(initial: string) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    svg.setAttribute("viewBox", initial);
    return svg;
  }

  function parseViewBox(svg: SVGSVGElement) {
    return (svg.getAttribute("viewBox") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
  }

  it("animates the viewBox attribute toward the target over time", async () => {
    const svg = makeSvg("0 0 100 100");
    const target = { x: 0, y: 0, width: 200, height: 200 };
    animateViewBox(svg, target, 50);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const [x, y, width, height] = parseViewBox(svg);
    expect(x).toBeCloseTo(target.x, 0);
    expect(y).toBeCloseTo(target.y, 0);
    expect(width).toBeCloseTo(target.width, 0);
    expect(height).toBeCloseTo(target.height, 0);
  });

  it("sets the viewBox instantly when prefers-reduced-motion is set", () => {
    const svg = makeSvg("0 0 100 100");
    const target = { x: 5, y: 5, width: 50, height: 50 };

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );

    animateViewBox(svg, target, 5000);

    const [x, y, width, height] = parseViewBox(svg);
    expect({ x, y, width, height }).toEqual(target);
  });
});
