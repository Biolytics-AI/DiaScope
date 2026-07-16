import { useEffect, useState } from "react";
import type { GraphIndex } from "@diascope/core";
import { WasmD2Compiler, type D2Compiler } from "@diascope/d2";

// The WASM compiler is expensive to construct-and-warm; share one instance as the default
// so multiple useNarrative call sites in an app don't each pay for their own.
const defaultCompiler = new WasmD2Compiler();

// Keyed by raw D2 source so repeated mounts (or StrictMode's double-invoke) of the same
// document reuse the in-flight/completed compile instead of recompiling, and so the
// resolved {svg, index} object is the SAME reference across callers — GraphCanvas relies on
// that identity stability to avoid remounting the SVG on every render.
const cache = new Map<string, Promise<{ svg: string; index: GraphIndex }>>();

export interface UseNarrativeResult {
  ready: boolean;
  svg: string;
  index: GraphIndex | null;
  error: Error | null;
}

/**
 * Compiles `d2Source` (via `compiler`, defaulting to a shared WasmD2Compiler) and exposes the
 * result as React state. Compiles are cached by source text at module scope, and each
 * resolved {svg, index} is stored as a single state object so `svg`/`index` keep stable
 * identities across rerenders once ready — consumers (e.g. GraphCanvas) depend on that to
 * avoid tearing down and rebuilding the hosted SVG on every render.
 */
export function useNarrative(d2Source: string, compiler: D2Compiler = defaultCompiler): UseNarrativeResult {
  const [result, setResult] = useState<{ svg: string; index: GraphIndex } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let live = true;
    setResult(null);
    setError(null);

    if (!cache.has(d2Source)) cache.set(d2Source, compiler.compile(d2Source));
    cache.get(d2Source)!.then(
      r => {
        if (live) setResult(r);
      },
      e => {
        // Don't let a failed compile poison the cache for a subsequent retry of the same
        // source (e.g. after the user fixes a typo and the caller re-mounts).
        cache.delete(d2Source);
        if (live) setError(e instanceof Error ? e : new Error(String(e)));
      }
    );

    return () => {
      live = false;
    };
  }, [d2Source, compiler]);

  return { ready: !!result, svg: result?.svg ?? "", index: result?.index ?? null, error };
}
