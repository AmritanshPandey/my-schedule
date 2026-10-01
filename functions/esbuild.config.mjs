// Bundles this Function's source together with @planr/core (which ships as
// raw, un-built .ts — see packages/core/package.json) into one self-contained
// ESM file. The Functions deploy only uploads this directory, so the shared
// domain logic (lib/milestoneHealth.ts, lib/paceModel.ts, ...) has to be
// inlined here rather than resolved from a sibling workspace folder that
// won't exist on the deployed instance.
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // firebase-admin/firebase-functions are present in the deployed runtime's
  // node_modules (this package's own dependencies) — bundling them in would
  // just bloat the artifact without buying anything. @planr/core is
  // deliberately NOT listed here — it ships as raw source with no build step
  // of its own (see packages/core/package.json), so it has to be resolved
  // and inlined at bundle time, same as any other first-party source file.
  external: ["firebase-admin", "firebase-admin/*", "firebase-functions", "firebase-functions/*"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild watching for changes...");
} else {
  await build(options);
}
