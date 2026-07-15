import { D2 } from "@terrastruct/d2";
import type { CompileRequest, CompileOptions as D2CompileOptions } from "@terrastruct/d2";
import type { GraphIndex } from "@diascope/core";
import { buildGraphIndex, type D2Diagram } from "./index-builder.js";

export interface CompileResult {
  svg: string;
  index: GraphIndex;
}

export interface CompileOptions {
  layout?: "dagre" | "elk";
}

export interface D2Compiler {
  compile(source: string, opts?: CompileOptions): Promise<CompileResult>;
}

// The WASM D2 module is expensive to initialize; share a single instance across compiles.
let shared: D2 | null = null;

// @terrastruct/d2's worker wrapper stores a single in-flight resolver (currentResolve /
// currentReject) with no queue, so two concurrent requests deadlock: the second overwrites
// the first's resolver and the first promise never settles. Serialize ALL worker traffic
// (both compile and render go through the worker) with a module-level promise chain.
let queue: Promise<unknown> = Promise.resolve();

export class WasmD2Compiler implements D2Compiler {
  async compile(source: string, opts: CompileOptions = {}): Promise<CompileResult> {
    const run = async (): Promise<CompileResult> => {
      shared ??= new D2();

      // If the D2 source configures its own layout engine (vars: d2-config: layout-engine),
      // passing a `layout` option conflicts with it, so omit ours in that case.
      const sourceSetsLayout = /layout-engine\s*:/.test(source);
      const compileOpts: D2CompileOptions = sourceSetsLayout ? {} : { layout: opts.layout ?? "dagre" };
      // @terrastruct/d2@0.1.33's .d.ts types the (source: string, options) overload's second
      // param as Omit<CompileRequest, "fs"> (i.e. { options: CompileOptions }), but the actual
      // runtime (dist/node-esm/index.js: `typeof e === "string" ? {fs:{index:e}, options:t} : ...`)
      // treats the second argument as CompileOptions directly when the first argument is a
      // string. This cast follows the verified runtime contract over the incorrect .d.ts.
      const result = await shared.compile(source, compileOpts as unknown as Omit<CompileRequest, "fs">);
      const svg = await shared.render(result.diagram, result.renderOptions);

      // @terrastruct/d2's Shape/Connection types structurally satisfy the D2Shape/D2Connection
      // subsets index-builder reads (id, label, classes, pos, width, height / src, dst, label).
      const diagram: D2Diagram = result.diagram;

      return { svg, index: buildGraphIndex(diagram) };
    };

    // Run after whatever is currently in flight, whether it succeeded or failed (`run` as both
    // fulfillment and rejection handler), and never let a failed compile poison the queue.
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  }
}
