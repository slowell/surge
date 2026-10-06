import { defineConfig } from "tsup";

// Bundle @surge/shared (TypeScript source, no build step) into the output so `node dist/*.js` runs as-is.
// Third-party dependencies stay external and resolve from node_modules.
export default defineConfig({
  entry: { server: "src/server.ts", worker: "src/worker/index.ts" },
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@surge/shared"],
});
