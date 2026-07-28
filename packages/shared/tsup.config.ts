// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  format: ["esm", "cjs"],
  entry: ["src/index.ts", "src/mcp.ts", "src/schema.ts", "src/error.ts"],
  clean: true,
  target: "esnext",
  treeshake: false,
  keepNames: true,
  tsconfig: "tsconfig.json",
  external: ["effect"],
});
