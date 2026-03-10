import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/viewer/index.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/d2-story-viewer.bundle.js",
  platform: "browser",
});
