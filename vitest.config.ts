import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/load-env.ts"],
    // These are integration tests against one shared local Postgres
    // instance, and several files reuse the same seeded fixtures (e.g.
    // Frank's assessment/plan). Running test files in parallel workers
    // would race those shared mutations — keep this false.
    fileParallelism: false,
  },
});
