import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/viewer/index.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/diascope.bundle.js",
  platform: "browser",
});
