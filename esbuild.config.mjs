import esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["dist/index.js"],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: "sea-bundle.cjs",
    format: "cjs",
    // Mark native addons as external if present
    external: [],
  })
  .catch(() => process.exit(1));
