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
const graphD2 = resolve(fixtures, "graph.d2");

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

  it("throws an actionable error for an out-of-range step", async () => {
    let error: Error | undefined;
    try {
      await runResolve(validYaml, "main", 99);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain("out of range");
  }, 30_000);
});

describe("runInspect", () => {
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
