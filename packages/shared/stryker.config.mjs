// Stryker 9.x configuration for @effect-mcp/shared.
//
// NOTE - deviations from the design spec:
//   1. No `defineConfig`/`vitest`/`typescriptCheckers` named imports.
//      Stryker 9.x consumes a plain object; plugin packages are explicit.
//   2. No `thresholds.per` - Stryker 9.x only supports a global threshold
//      (`high`/`low`/`break`). Per-file mutation-score gates will be re-evaluated
//      from the JSON report in the cycle notes (see docs/snowball/cycles/).
//   3. `inPlace: true` - Stryker 9.6.1's TSConfigPreprocessor calls
//      `ts.parseConfigFileTextToJson`, which TypeScript 7.x removed.
//      Running `inPlace` skips the preprocessor entirely.
//   4. Explicit `plugins` array - running Stryker from a workspace sub-package
//      (pnpm isolates `node_modules` per package), the auto-discovery glob
//      `@stryker-mutator/*` does not see the sibling plugins. Listing them
//      explicitly resolves the "no TestRunner plugins were loaded" error.
//
// See docs/snowball/cycles/2026-07-28-stryker-shared-pilot-cycle-notes.md.

export default {
  packageManager: "pnpm",
  plugins: [
    "@stryker-mutator/vitest-runner",
    "@stryker-mutator/typescript-checker",
  ],
  inPlace: true,
  testRunner: "vitest",
  vitest: {
    // Re-use the workspace-root vitest config (its `test.include` already
    // globs `packages/**/*.{test,spec}.ts`). Disable `related` mode so
    // Stryker runs every test file, not just the ones it detects as related.
    related: false,
  },
  typescriptChecker: {
    // Keep `prioritizePerformanceOverAccuracy: true` (the default) - Stryker
    // documentation flags the slower path as not significantly more accurate.
  },
  mutate: [
    "src/**/*.ts",
    "!**/*.test.ts",
    "!**/*.spec.ts",
    "!**/*.bench.ts",
    "!src/index.ts",
  ],
  thresholds: {
    // Global floor only; per-file gates are recorded as data, not enforced.
    high: 90,
    low: 50,
    break: 0,
  },
  reporters: ["html", "clear-text", "json"],
  htmlReporter: { fileName: "reports/mutation.html" },
};
