import { defineConfig } from "vitest/config";

// Three projects so `pnpm test` and `pnpm test:concurrency` can run separately.
// integration and concurrency need Postgres + Redis; services-check fails fast with a clear message if they're down.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "apps/*/test/unit/**/*.test.ts", "scripts/**/*.test.{ts,mjs}"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["apps/api/test/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["apps/api/test/setup/services-check.ts"],
          // Integration tests share one database; run files one at a time.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: "concurrency",
          include: ["apps/api/test/concurrency/**/*.test.ts"],
          environment: "node",
          globalSetup: ["apps/api/test/setup/services-check.ts"],
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
