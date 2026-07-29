// @ts-check
import { defineConfig } from "@stryker-mutator/core";
import { vitest } from "@stryker-mutator/vitest-runner";
import { typescriptCheckers } from "@stryker-mutator/typescript-checker";

export default defineConfig({
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest,
  checkers: [typescriptCheckers],
  mutate: [
    "src/**/*.ts",
    "!*.test.ts",
    "!*.spec.ts",
    "!*.bench.ts",
    "!src/index.ts",
  ],
  thresholds: {
    high: 90,
    low: 50,
    per: {
      "src/mcp.ts":    { high: 95, low: 90 },
      "src/error.ts":  { high: 85, low: 80 },
      "src/schema.ts": { high: 70, low: 50 },
    },
  },
  reporters: ["html", "clear-text", "json"],
  htmlReporter: { fileName: "reports/mutation.html" },
});
