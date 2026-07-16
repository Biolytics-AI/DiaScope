// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import type { GraphIndex } from "@diascope/core";
import { WasmD2Compiler } from "../src/compiler.js";
import { SvgGraphBinding } from "../src/binding.js";

const SRC = `
sys: System { api: API { class: svc } }
request: Request { class: entry }
request -> sys.api: query
`;

describe("SvgGraphBinding", () => {
  let index: GraphIndex;
  let binding: SvgGraphBinding;

  beforeAll(async () => {
    // @terrastruct/d2's worker bootstrap branches on `typeof window === "undefined"` to
    // decide whether it's running in Node (raw wasm_exec.js content, worker_threads
    // `.on("message", ...)`) or a browser (Blob-URL wasm_exec.js via URL.createObjectURL,
    // `.onmessage = ...`). It always spins up a real node:worker_threads Worker either way,
    // so under the jsdom test environment — where `window` exists as a global — it wrongly
    // takes the browser branch and breaks (jsdom's URL has no createObjectURL, and
    // worker_threads.Worker doesn't dispatch through an `onmessage` property). Hide `window`
    // for the duration of the compile only, so the compiler runs exactly as it does under
    // the plain "node" test environment; DOMParser/document are unaffected by this and stay
    // available for parsing the returned SVG afterwards.
    const savedWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    let result: { svg: string; index: GraphIndex };
    try {
      result = await new WasmD2Compiler().compile(SRC);
    } finally {
      (globalThis as { window?: unknown }).window = savedWindow;
    }
    index = result.index;
    const svgDoc = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    binding = new SvgGraphBinding(svgDoc.documentElement, index);
  }, 30_000);

  it("finds a node element by semantic id and it carries the expected class", () => {
    const el = binding.nodeElement("sys.api");
    expect(el).not.toBeNull();
    expect(el!.getAttribute("class")).toContain("svc");
  });

  it("finds another node element by semantic id", () => {
    expect(binding.nodeElement("request")).not.toBeNull();
  });

  it("returns null for an unknown node id", () => {
    expect(binding.nodeElement("nope")).toBeNull();
  });

  it("finds an edge element by semantic id with literal -> (html-unescape mapping)", () => {
    expect(binding.edgeElement("(request -> sys.api)[0]")).not.toBeNull();
  });

  it("computes bounds for a single node from index geometry", () => {
    const api = index.nodes.find((n) => n.id === "sys.api")!;
    expect(binding.bounds(["sys.api"])).toEqual(api.geometry);
  });

  it("computes the union bounds for multiple nodes", () => {
    const api = index.nodes.find((n) => n.id === "sys.api")!.geometry!;
    const request = index.nodes.find((n) => n.id === "request")!.geometry!;
    const x1 = Math.min(api.x, request.x);
    const y1 = Math.min(api.y, request.y);
    const x2 = Math.max(api.x + api.width, request.x + request.width);
    const y2 = Math.max(api.y + api.height, request.y + request.height);
    expect(binding.bounds(["sys.api", "request"])).toEqual({
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    });
  });

  it("returns null bounds for an unknown id", () => {
    expect(binding.bounds(["nope"])).toBeNull();
  });

  it("returns null bounds for an empty id list", () => {
    expect(binding.bounds([])).toBeNull();
  });
});
