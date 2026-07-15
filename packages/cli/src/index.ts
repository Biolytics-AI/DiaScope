#!/usr/bin/env node
import { Command } from "commander";
import { runValidate } from "./commands/validate.js";
import { runInspect } from "./commands/inspect.js";

const program = new Command().name("diascope2").description("DiaScope v2 agent CLI");

program
  .command("validate <doc>")
  .description("Validate a narrative document against its D2 graph")
  .option("--json", "machine-readable output")
  .action(async (doc: string, opts: { json?: boolean }) => {
    try {
      const result = await runValidate(doc);
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else {
        for (const e of result.errors) console.error(`ERROR ${e.path}: ${e.message}`);
        for (const w of result.warnings) console.warn(`warn  ${w.path}: ${w.message}`);
        console.log(result.valid ? "✓ valid" : `✗ ${result.errors.length} error(s)`);
      }
      process.exitCode = result.valid ? 0 : 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (opts.json) console.log(JSON.stringify({ valid: false, fatal: msg }, null, 2));
      else console.error(`fatal: ${msg}`);
      process.exitCode = 2;
    }
  });

const graph = program.command("graph").description("Graph inspection commands");
graph
  .command("inspect <d2file>")
  .description("Print the machine-readable node/edge inventory of a D2 file")
  .option("--json", "machine-readable output")
  .action(async (d2file: string, opts: { json?: boolean }) => {
    try {
      const index = await runInspect(d2file);
      if (opts.json) console.log(JSON.stringify(index, null, 2));
      else {
        for (const n of index.nodes)
          console.log(`node ${n.id}${n.classes.length ? `  [${n.classes.join(", ")}]` : ""}  "${n.label}"`);
        for (const e of index.edges) console.log(`edge ${e.source} -> ${e.target}${e.label ? `  "${e.label}"` : ""}`);
      }
    } catch (e) {
      console.error(`fatal: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 2;
    }
  });

program.parseAsync().then(() => {
  // let the process exit naturally; wasm worker keeps the loop alive otherwise
  if (process.exitCode === undefined) process.exitCode = 0;
  setImmediate(() => process.exit(process.exitCode as number));
});
