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

export class WasmD2Compiler implements D2Compiler {
  async compile(source: string, opts: CompileOptions = {}): Promise<CompileResult> {
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

    // @terrastruct/d2's Shape type is a union (Class | SQLTable | Text) & ShapeBase, which
    // TypeScript can't narrow to "definitely has .label" the way index-builder needs. The
    // fields we actually read (id, label, classes, pos, width, height / src, dst, label) are
    // present on every shape/connection at runtime, so this single cast documents that gap.
    const diagram = result.diagram as unknown as D2Diagram;

    return { svg, index: buildGraphIndex(diagram) };
  }
}
