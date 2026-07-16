import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runValidate } from "../src/commands/validate.js";
import { runInspect } from "../src/commands/inspect.js";
import { runResolve } from "../src/commands/resolve.js";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "fixtures");
const validYaml = resolve(fixtures, "valid.yaml");
const invalidYaml = resolve(fixtures, "invalid.yaml");
const missingGraphYaml = resolve(fixtures, "missing-graph.yaml");
const malformedGraphYaml = resolve(fixtures, "malformed-graph.yaml");
const graphD2 = resolve(fixtures, "graph.d2");
const malformedD2 = resolve(fixtures, "malformed.d2");
const viewsYaml = resolve(fixtures, "views.yaml");

describe("runValidate", () => {
  it("reports valid: true, no errors, for a valid doc", async () => {
    const result = await runValidate(validYaml);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // warnings may be non-empty
    expect(Array.isArray(result.warnings)).toBe(true);
  }, 30_000);

  it("reports valid: false with unknown-reference and invalid-trace errors for an invalid doc", async () => {
    const result = await runValidate(invalidYaml);
    expect(result.valid).toBe(false);

    const unknownRef = result.errors.find((e) => e.reason === "unknown-reference");
    expect(unknownRef).toBeDefined();
    expect(unknownRef!.suggestions).toContain("sys.api");

    const invalidTrace = result.errors.find((e) => e.reason === "invalid-trace");
    expect(invalidTrace).toBeDefined();
  }, 30_000);

  it("throws an actionable error naming the resolved path when graph.source is missing", async () => {
    const resolvedD2Path = resolve(dirname(missingGraphYaml), "./nope.d2");
    let error: Error | undefined;
    try {
      await runValidate(missingGraphYaml);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain(resolvedD2Path);
    expect(error!.message).toContain("not found");
  }, 30_000);

  it("surfaces readable d2 compile errors (not raw JSON) when the graph is malformed", async () => {
    const err: Error = await runValidate(malformedGraphYaml).then(
      () => {
        throw new Error("expected runValidate to reject");
      },
      (e) => e as Error
    );
    expect(err.message).toContain("connection missing destination");
    expect(err.message).not.toContain('{"range"');
  }, 30_000);
});

describe("runResolve", () => {
  it("returns the computed SceneState for a valid scene+step", async () => {
    const { state, graphPath } = await runResolve(validYaml, "main", 0);
    expect(graphPath).toBe(graphD2);
    expect(state.highlighted).toEqual(["request"]);
    expect(state.visible).toContain("request");
  }, 30_000);

  it("reflects a step's trace and popover", async () => {
    const { state } = await runResolve(validYaml, "main", 1);
    expect(state.traced).toHaveLength(1);
    expect(state.traced[0]).toMatchObject({ source: "request", target: "sys.api" });
    expect(state.popovers).toHaveLength(1);
    expect(state.popovers[0]).toMatchObject({ target: "sys.api" });
  }, 30_000);

  it("throws an actionable error for an unknown scene", async () => {
    let error: Error | undefined;
    try {
      await runResolve(validYaml, "nope", 0);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain("Unknown scene");
  }, 30_000);

  // NOTE: pre-audience-lenses, runResolve called resolveStep directly, which threw on an
  // out-of-range stepIndex. runResolve now delegates to @diascope/core's resolveStepInView
  // (Task 5 of the audience-lenses plan), which deliberately CLAMPS stepIndex instead of
  // throwing (see packages/core/src/views.ts + tests/views.test.ts "clamps an out-of-range
  // stepIndex..." — clamping lets a live lens-switching UI survive a transient stale index).
  // That contract change is intentional and applies uniformly to every resolveStepInView
  // caller, CLI included, so this test now asserts the clamp instead of a throw.
  it("clamps an out-of-range step to the scene's last step instead of throwing", async () => {
    const { state } = await runResolve(validYaml, "main", 99);
    const lastStep = await runResolve(validYaml, "main", 1); // "main" has exactly 2 steps (indices 0-1)
    expect(state).toEqual(lastStep.state);
  }, 30_000);
  it("surfaces readable d2 compile errors (not raw JSON) when the graph is malformed", async () => {
    const err: Error = await runResolve(malformedGraphYaml, "main", 0).then(
      () => {
        throw new Error("expected runResolve to reject");
      },
      (e) => e as Error
    );
    expect(err.message).toContain("connection missing destination");
    expect(err.message).not.toContain('{"range"');
  }, 30_000);

  it("runResolve defaults to the 'default' view", async () => {
    const { state } = await runResolve(viewsYaml, "main", 0);
    expect(state.cameraFit.length).toBeGreaterThan(0); // fit:all resolves to every visible node
  }, 30_000);

  it("runResolve resolves against an explicit --view", async () => {
    const { state } = await runResolve(viewsYaml, "main", 0, "legal");
    expect(state.highlighted).toEqual(["sys.api"]);
  }, 30_000);
});

describe("runInspect", () => {
  it("surfaces readable d2 compile errors (not raw JSON) on malformed d2", async () => {
    const err: Error = await runInspect(malformedD2).then(
      () => {
        throw new Error("expected runInspect to reject");
      },
      (e) => e as Error
    );
    expect(err.message).toContain("connection missing destination");
    expect(err.message).not.toContain('{"range"');
  }, 30_000);

  it("returns the node/edge index for a D2 file", async () => {
    const index = await runInspect(graphD2);
    const api = index.nodes.find((n) => n.id === "sys.api");
    expect(api).toBeDefined();
    expect(api!.classes).toContain("svc");
    expect(api!.parent).toBe("sys");

    const edge = index.edges.find((e) => e.source === "request" && e.target === "sys.api");
    expect(edge).toBeDefined();
    expect(edge!.label).toBe("query");
  }, 30_000);
});

const cliPackageDir = resolve(here, "..");
const distIndex = resolve(cliPackageDir, "dist/index.js");

describe("bin smoke test", () => {
  beforeAll(() => {
    if (!existsSync(distIndex)) {
      execFileSync("npm", ["run", "build", "-w", "@diascope/cli"], {
        cwd: resolve(cliPackageDir, "../.."),
        stdio: "inherit",
      });
    }
  }, 60_000);

  it("graph inspect --json exits 0 and prints parseable JSON with nodes+edges", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const { stdout } = await execFileAsync("node", [distIndex, "graph", "inspect", graphD2, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  }, 30_000);

  it("validate --json on an invalid doc exits 1 and prints JSON with valid:false", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const err: { code?: number; stdout?: string } = await execFileAsync("node", [
      distIndex,
      "validate",
      invalidYaml,
      "--json",
    ]).catch((e) => e);
    expect(err.code).toBe(1);
    const parsed = JSON.parse(err.stdout ?? "");
    expect(parsed.valid).toBe(false);
  }, 30_000);

  it("validate (no --json) on a valid doc exits 0 and prints a human-readable ✓ valid", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const { stdout } = await execFileAsync("node", [distIndex, "validate", validYaml]);
    expect(stdout).toContain("✓ valid");
  }, 30_000);

  it("prints multi-line D2 labels on a single line in pretty mode", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const multilineD2 = resolve(fixtures, "multiline.d2");
    const { stdout } = await execFileAsync("node", [distIndex, "graph", "inspect", multilineD2]);
    // Node label "Access Control\n(service authorization)" must be flattened to " / "
    expect(stdout).toContain('node ac  "Access Control / (service authorization)"');
    // Edge label "grants\naccess" likewise
    expect(stdout).toContain('edge ac -> gw  "grants / access"');
    // No entry may span multiple terminal lines: every line starts with node/edge
    for (const line of stdout.split("\n").filter((l) => l.length > 0)) {
      expect(line).toMatch(/^(node|edge) /);
    }
  }, 30_000);

  it("resolve --json on a valid doc+scene+step exits 0 and prints a SceneState", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const { stdout } = await execFileAsync("node", [
      distIndex,
      "resolve",
      validYaml,
      "--scene",
      "main",
      "--step",
      "1",
      "--json",
    ]);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.visible)).toBe(true);
    expect(Array.isArray(parsed.highlighted)).toBe(true);
    expect(Array.isArray(parsed.cameraFit)).toBe(true);
  }, 30_000);

  it("resolve on an unknown scene exits 2 with a readable fatal message", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const err: { code?: number; stderr?: string } = await execFileAsync("node", [
      distIndex,
      "resolve",
      validYaml,
      "--scene",
      "nope",
      "--step",
      "0",
    ]).catch((e) => e);
    expect(err.code).toBe(2);
    expect(err.stderr ?? "").toContain("Unknown scene");
  }, 30_000);

  it("does not clip stdout on large `graph inspect` output (vLLM example)", async () => {
    if (!existsSync(distIndex)) return; // skip-if-no-dist
    const vllmD2 = resolve(cliPackageDir, "../../examples/vLLM/deployment.d2");
    if (!existsSync(vllmD2)) return;
    const { stdout } = await execFileAsync("node", [distIndex, "graph", "inspect", vllmD2, "--json"], {
      maxBuffer: 1024 * 1024 * 16,
    });
    // A clipped write would produce invalid/truncated JSON here.
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(stdout.trimEnd().endsWith("}")).toBe(true);
  }, 60_000);
});
