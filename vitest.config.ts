import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const src = (pkg: string) => fileURLToPath(new URL(`packages/${pkg}/src`, import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ["@effect-mcp/dev", "node", "import", "default"],
    alias: {
      "@effect-mcp/shared": src("shared"),
      "@effect-mcp/shared/": `${src("shared")}/`,
      "@effect-mcp/server": src("server"),
      "@effect-mcp/server/": `${src("server")}/`,
      "@effect-mcp/client": src("client"),
      "@effect-mcp/client/": `${src("client")}/`,
    },
  },
  test: {
    root,
    include: ["packages/**/*.{test,spec}.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  benchmark: {
    root,
    include: ["packages/**/*.bench.ts"],
    reporters: ["default"],
    outputJson: undefined,
  },
});
