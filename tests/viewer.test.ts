import { describe, expect, it, vi } from "vitest";
import { DiaScopeViewer } from "../src/viewer/viewer.js";

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Array<() => void | Promise<void>>>();
  readonly attributes = new Map<string, string>();
  readonly classList = {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false),
  };
  innerHTML = "";
  title = "";
  id = "";
  clientWidth = 0;
  clientHeight = 0;
  requestFullscreen = vi.fn(() => Promise.resolve());

  constructor(private readonly doc: FakeDocument, id = "") {
    this.id = id;
    if (id) this.attributes.set("id", id);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") {
      this.id = value;
      this.doc.register(this);
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
    if (child.id) this.doc.register(child);
  }

  addEventListener(type: string, listener: () => void | Promise<void>): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  async click(): Promise<void> {
    for (const listener of this.listeners.get("click") ?? []) await listener();
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }
}

class FakeDocument {
  readonly elements = new Map<string, FakeElement>();
  readonly listeners = new Map<string, Array<() => void>>();
  readonly body = new FakeElement(this, "body");
  readonly documentElement = new FakeElement(this, "document-element");
  readonly defaultView = {
    location: { href: "https://diascope.biolytics.ai/examples/vllm/deployment.html?expandable" },
    open: vi.fn(),
  };
  fullscreenElement: FakeElement | null = null;
  exitFullscreen = vi.fn(() => {
    this.fullscreenElement = null;
    this.dispatch("fullscreenchange");
    return Promise.resolve();
  });

  register(element: FakeElement): FakeElement {
    if (element.id) this.elements.set(element.id, element);
    return element;
  }

  createElement(): FakeElement {
    return new FakeElement(this);
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "#svg-host > svg") return this.getElementById("diagram-svg");
    if (!selector.startsWith("#")) return null;
    return this.getElementById(selector.slice(1));
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  addEventListener(type: string, listener: () => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function createViewerHarness() {
  const doc = new FakeDocument();
  const canvasWrap = doc.register(new FakeElement(doc, "canvas-wrap"));
  canvasWrap.clientWidth = 556;
  canvasWrap.clientHeight = 291;
  const svgHost = doc.register(new FakeElement(doc, "svg-host"));
  const svg = doc.register(new FakeElement(doc, "diagram-svg"));
  svgHost.appendChild(svg);
  doc.register(new FakeElement(doc, "story-shell"));

  let zoom = 2;
  let pan = { x: 40, y: 60 };

  const pz = {
    fit: vi.fn(),
    center: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoom: vi.fn((value: number) => {
      zoom = value;
    }),
    pan: vi.fn((value: { x: number; y: number }) => {
      pan = value;
    }),
    getZoom: vi.fn(() => zoom),
    getPan: vi.fn(() => pan),
  };

  const viewer = new DiaScopeViewer({
    document: doc as unknown as Document,
    svgPanZoom: (() => pz) as never,
    steps: [],
  });

  return { doc, canvasWrap, svg, viewer, pz };
}

describe("DiaScopeViewer expand button", () => {
  it("fullscreens the viewer shell instead of the whole document when embedded", async () => {
    const doc = new FakeDocument();
    const canvasWrap = doc.register(new FakeElement(doc, "canvas-wrap"));
    const storyShell = doc.register(new FakeElement(doc, "story-shell"));
    const resizeSpy = vi.fn();

    storyShell.requestFullscreen.mockImplementation(() => {
      doc.fullscreenElement = storyShell;
      doc.dispatch("fullscreenchange");
      return Promise.resolve();
    });

    doc.documentElement.requestFullscreen.mockImplementation(() => {
      doc.fullscreenElement = doc.documentElement;
      doc.dispatch("fullscreenchange");
      return Promise.resolve();
    });

    const viewer = new DiaScopeViewer({
      document: doc as unknown as Document,
      svgPanZoom: (() => null) as never,
    });
    viewer.canvasWrap = canvasWrap as unknown as HTMLElement;
    viewer.onResize = resizeSpy;

    viewer.setupExpandButton();
    await doc.getElementById("btn-expand")?.click();

    expect(storyShell.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(resizeSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to opening the standalone story when fullscreen is blocked", async () => {
    const doc = new FakeDocument();
    const canvasWrap = doc.register(new FakeElement(doc, "canvas-wrap"));
    const storyShell = doc.register(new FakeElement(doc, "story-shell"));

    storyShell.requestFullscreen.mockRejectedValue(new Error("Permission denied"));

    const viewer = new DiaScopeViewer({
      document: doc as unknown as Document,
      svgPanZoom: (() => null) as never,
    });
    viewer.canvasWrap = canvasWrap as unknown as HTMLElement;

    viewer.setupExpandButton();
    await doc.getElementById("btn-expand")?.click();

    expect(doc.defaultView.open).toHaveBeenCalledWith(
      "https://diascope.biolytics.ai/examples/vllm/deployment.html",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("DiaScopeViewer resize handling", () => {
  it("preserves the current viewport state when the canvas size changes", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { canvasWrap, svg, viewer, pz } = createViewerHarness();

    viewer.init();
    vi.clearAllMocks();

    canvasWrap.clientWidth = 776;
    canvasWrap.clientHeight = 560;
    viewer.onResize?.();

    expect(svg.getAttribute("width")).toBe("776");
    expect(svg.getAttribute("height")).toBe("560");
    expect(pz.resize).toHaveBeenCalledTimes(1);
    expect(pz.zoom).toHaveBeenCalledWith(2);
    expect(pz.pan).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(pz.fit).not.toHaveBeenCalled();
    expect(pz.center).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("restores the last known good viewport when the current one is invalid", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { canvasWrap, viewer, pz } = createViewerHarness();

    viewer.init();
    pz.zoom(0);
    pz.pan({ x: 0, y: 0 });
    viewer["lastKnownViewport"] = { zoom: 1.5, pan: { x: 12, y: 24 } };
    vi.clearAllMocks();

    canvasWrap.clientWidth = 776;
    canvasWrap.clientHeight = 560;
    viewer.onResize?.();

    expect(pz.zoom).toHaveBeenCalledWith(1.5);
    expect(pz.pan).toHaveBeenCalledWith({ x: 12, y: 24 });
    expect(pz.fit).not.toHaveBeenCalled();
    expect(pz.center).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
