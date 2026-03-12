import { describe, expect, it, vi } from "vitest";
import { DiaScopeViewer } from "../src/viewer/viewer.js";

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  readonly attributes = new Map<string, string>();
  innerHTML = "";
  title = "";
  id = "";
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

  addEventListener(type: string, listener: () => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }
}

class FakeDocument {
  readonly elements = new Map<string, FakeElement>();
  readonly listeners = new Map<string, Array<() => void>>();
  readonly documentElement = new FakeElement(this, "document-element");
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
    if (!selector.startsWith("#")) return null;
    return this.getElementById(selector.slice(1));
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

describe("DiaScopeViewer expand button", () => {
  it("fullscreens the viewer shell instead of the whole document when embedded", () => {
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
    doc.getElementById("btn-expand")?.click();

    expect(storyShell.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(resizeSpy).toHaveBeenCalledTimes(1);
  });
});
