# Stryker Pilot — `packages/shared`

| Field     | Value                                                            |
|-----------|------------------------------------------------------------------|
| Date      | 2026-07-28                                                       |
| Status    | Approved; pending implementation                                |
| Cycle     | Pilot (step 1 of N — `client` and `server` will follow separately) |
| Spec path | `docs/snowball/specs/2026-07-28-stryker-shared-pilot-design.md`  |

## Context

`packages/shared` defines the JSON-RPC 2.0 wire format that every other package in
the monorepo depends on:

- `src/schema.ts` — ~24 KB of `effect/Schema` definitions (JSON-RPC envelope,
  request/response/notification/error shapes, MCP protocol types).
- `src/error.ts` — JSON-RPC error codes (`JsonRpcErrorCode`) and the
  `JsonRpcError` tagged-error class with a `fromCode` factory.
- `src/mcp.ts` — the `MCP.Service` interface, the `MCP` `Context.Tag`, and the
  inbound `handleMessage` dispatcher.
- `src/index.ts` — 4-line barrel re-exporting the above.

Currently **zero tests** exist for any of these. (`find packages -name "*.test.ts"
-o -name "*.spec.ts"` returns no results.) The README checklist still has
`- [ ] Add tests` unchecked.

`vitest@4.1.10` is already installed at the workspace root with a `vitest.config.ts`
that aliases all three packages. `tsconfig.base.json` excludes test files
(`exclude: ["**/*.test.ts", "**/*.spec.ts"]`), so the project is *primed* for
tests to be added. Plain coverage (line/branch) doesn't catch every class of
regression — a test suite can be green while covering dead code or assertions
that don't actually exercise the behavior.

**Mutation testing** (Stryker Mutator) is a complementary metric: it mutates the
source code in small ways ("mutants") and checks whether the existing test suite
catches the mutation. Surviving mutants indicate genuinely untested behavior.

This cycle is a **pilot** establishing the toolchain and a baseline mutation
score in the lowest-dependency package (`shared`, only depends on `effect`).
Once the pipeline is proven here, `client` (33 KB source) and `server` (22 KB
source) get the same treatment in separate cycles.

## Decisions (locked)

| # | Decision                  | Choice                                                                                | Rationale                                                                  |
|---|---------------------------|---------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| 1 | Decomposition             | Pilot `shared` only; `client` and `server` as separate cycles                         | Smallest dep tree; surfaces toolchain choices before committing larger work |
| 2 | Stryker config topology   | Per-package `stryker.config.mjs`; root `pnpm test:mutate` aggregates via `-r --if-present` | Per-package scores; scales cleanly to all 3 packages                       |
| 3 | Test surface inside `shared` | `schema.ts` + `error.ts` + `mcp.ts` (skip `index.ts` barrel)                       | Three testable source units                                                |
| 4 | Mutator strictness        | Default mutators + `@stryker-mutator/typescript-checker`                              | TS-checker catches mutants that survive tests but fail `tsc --noEmit`      |
| 5 | Acceptance thresholds     | Per-file: `mcp.ts` 90/95, `error.ts` 80/85, `schema.ts` 50/70 (`low`/`high`)          | Reflects realistic mutation scores per surface size and complexity         |

## Layout & file changes

### Files added under `packages/shared/`

- `src/schema.test.ts` — schema decode/encode/dispatch tests
- `src/error.test.ts`  — `JsonRpcErrorCode` + `JsonRpcError` + `fromCode` tests
- `src/mcp.test.ts`    — `handleMessage` dispatcher tests with mocked `MCP.Service`
- `stryker.config.mjs` — per-package Stryker configuration
- `reports/`           — generated at run time (gitignored)

### Files modified

- `packages/shared/package.json`
  - Add `scripts.test:mutate: "stryker run"`
  - Add `scripts.test:mutate:watch: "stryker run --watch"` (optional convenience)
  - Add `devDependencies`:
    - `@stryker-mutator/core@9.6.1`
    - `@stryker-mutator/vitest-runner@9.6.1`
    - `@stryker-mutator/typescript-checker@9.6.1`
- `package.json` (workspace root)
  - Add `"test:mutate": "pnpm -r --if-present test:mutate"` (placeholder; no-op
    until other packages add their configs)
- `.gitignore`
  - Add `**/reports/`

## Toolchain configuration

`packages/shared/stryker.config.mjs` (full content):

```js
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
```

Block-by-block rationale:

- `packageManager: "pnpm"` — Stryker detects the workspace context.
- `testRunner: "vitest"` + `vitest` — wires to this repo's vitest setup.
  Stryker reuses the root `vitest.config.ts`, whose
  `test.include` already globs `packages/**/*.{test,spec}.ts`.
- `checkers: [typescriptCheckers]` — `typescript-checker` re-evaluates each
  surviving mutant under `tsc --noEmit` and reports compiler-killed mutants
  separately.
- `mutate` — only source files; exclude test files, the existing bench file,
  and the `src/index.ts` barrel (no business logic).
- `thresholds.per` — per-file mutation-score gates (`low` = fail, `high` = warn).

## Test approach per source file

### `schema.ts` → `schema.test.ts`

For each exported schema in `src/schema.ts`:

- **Round-trip** — `Schema.encode(value)` → `Schema.decodeUnknownSync(encoded)`
  yields the original `value` (modulo non-deterministic ordering, which is
  asserted separately for objects).
- **Valid input** — assert the typed shape of the decoded value.
- **Invalid input** — `Schema.decodeUnknownEither(badInput)` returns
  `Either.left` (or expected failure variant).
- **Discriminated unions** — assert that each union member's specific
  discriminator field is required (wrong-shape payload returns `Left`).

No mocks. `Schema.decodeUnknownSync` is synchronous, so these tests are fast.

### `error.ts` → `error.test.ts`

```ts
describe("JsonRpcErrorCode", () => {
  it("exposes the JSON-RPC 2.0 standard codes", () => {
    expect(JsonRpcErrorCode.ParseError).toBe(-32700);
    expect(JsonRpcErrorCode.InvalidRequest).toBe(-32600);
    expect(JsonRpcErrorCode.MethodNotFound).toBe(-32601);
    expect(JsonRpcErrorCode.InvalidParams).toBe(-32602);
    expect(JsonRpcErrorCode.InternalError).toBe(-32603);
  });
  it("exposes SDK-defined codes", () => {
    expect(JsonRpcErrorCode.ConnectionClosed).toBe(-32000);
    expect(JsonRpcErrorCode.RequestTimeout).toBe(-32001);
  });
});

describe("JsonRpcError", () => {
  it("constructs with code/message/data and preserves fields", () => {
    const e = new JsonRpcError({
      code: -32000, message: "closed", data: { reason: "timeout" },
    });
    expect(e.code).toBe(-32000);
    expect(e.message).toBe("closed");
    expect(e.data).toEqual({ reason: "timeout" });
  });
  it("fromCode maps enum key to numeric", () => {
    const e = JsonRpcError.fromCode("ParseError", "bad json");
    expect(e.code).toBe(-32700);
    expect(e.message).toBe("bad json");
  });
  it("fromCode accepts optional data", () => {
    const e = JsonRpcError.fromCode("InternalError", "oops", { detail: 1 });
    expect(e.data).toEqual({ detail: 1 });
  });
  it("round-trips through Schema encode/decode", () => {
    const original = JsonRpcError.fromCode("InvalidParams", "x", { y: 1 });
    const encoded   = Schema.encodeSync(JsonRpcError)(original);
    const decoded   = Schema.decodeUnknownSync(JsonRpcError)(encoded);
    expect(decoded).toEqual(original);
  });
});
```

### `mcp.ts` → `mcp.test.ts`

**Strategy** — replace the `MCP` `Context.Tag` service with a `vi.fn()`-backed
mock; run `handleMessage` with `Effect.provideService(MCP, mock)` and
`Effect.runSync`. The dispatcher is synchronous (no fiber complexity).

**Priority matrix** (each row is one test):

| Input shape                                  | Expected handler                              |
|----------------------------------------------|-----------------------------------------------|
| `{ jsonrpc, id, error: {...} }`              | `handleError` (priority over `id` and `result`) |
| `{ jsonrpc, id, result: {...} }`             | `handleResponse` (priority over `id`)         |
| `{ jsonrpc, id, method, params }`            | `handleRequest`                               |
| `{ jsonrpc, method, params }` (no `id`)      | `handleNotification` (`orElse`)               |
| `{ jsonrpc, id, error: null }`               | `handleError` (`typeof null === "object"` in JS) |
| `{ jsonrpc, id, result: null }`              | `handleResponse` (`typeof null === "object"` in JS) |
| `{ jsonrpc, id, result: "string" }`          | `handleRequest` (guard `typeof === "object"` fails) |
| `{ jsonrpc, id, error: {...}, result: {...} }` | `handleError` (priority)                    |

The guard and priority rules come straight from `src/mcp.ts` lines 78–106 —
they are *the* behavior under test.

**Mock helper**:

```ts
const makeMockService = () => {
  const calls: Array<{ kind: string; msg: unknown }> = [];
  const tag = <K extends string>(kind: K) => (msg: unknown) => {
    calls.push({ kind, msg });
  };
  return {
    service: {
      handleError:        vi.fn().mockImplementation(tag("handleError")),
      handleResponse:     vi.fn().mockImplementation(tag("handleResponse")),
      handleRequest:      vi.fn().mockImplementation(tag("handleRequest")),
      handleNotification: vi.fn().mockImplementation(tag("handleNotification")),
    },
    calls,
  };
};

const dispatch = (message: JSONRPCMessage, service: MCP.Service) =>
  Effect.runSync(
    pipe(handleMessage(message), Effect.provideService(MCP, service))
  );
```

Each test asserts one handler's `vi.fn()` was called and the others were not.

## Acceptance criteria

- `pnpm --filter @effect-mcp/shared test:mutate` exits 0 with reports written
  to `packages/shared/reports/mutation.html` and JSON output.
- `pnpm test` (existing vitest run) continues to pass — proves the new test
  files don't regress.
- Per-file mutation-score thresholds met on the **first documented baseline
  run**:
  - `mcp.ts`: ≥ 90% (`low`); warn at < 95% (`high`)
  - `error.ts`: ≥ 80% (`low`); warn at < 85% (`high`)
  - `schema.ts`: ≥ 50% (`low`); warn at < 70% (`high`)
- `typescript-checker` results are included in the report (separate
  killed/live counts).
- `**/reports/` is in `.gitignore`.

If the **first** run lands under any `low` threshold, the cycle is not failed —
we tune tests *or* thresholds to a realistic level and document the actual
baseline in the cycle notes. Thresholds become gates from the **second** cycle
onward.

## Out of scope (deferred to follow-up cycles)

- Tests in `packages/client` — `client.ts` (33 KB), `messenger.ts`,
  `transport/stdio.ts`, `notifications.ts`.
- Tests in `packages/server` — `server.ts` (22 KB), `messenger.ts`,
  `transport/sse.ts`, `prompts/*`.
- Aggregator activation: the root `pnpm test:mutate` script is wired but is a
  no-op here; activating it across all 3 packages happens in the next cycle.
- Wiring `test:mutate` into `turbo.json` for CI integration.
- Treating the `// TODO: Implement` placeholders in `server.ts` and `client.ts`
  — the `_handleSubscribeToResourceList`, `_handleUnsubscribeFromResourceList`,
  `subscribe`, and `unsubscribe` stubs will get `stryker.ignorePatterns` when
  their respective cycles run.
- Vitest-effect-adapter vs direct `Effect.runSync` — direct calls are
  sufficient for `shared` because nothing here is async. Revisit when
  `client` / `server` cycles bring fibers into the test picture.

## Known limits

- Mutator runtimes scale with source size. First baseline run on `schema.ts`
  (~24 KB) is expected to take 5–15 minutes. Subsequent runs are usually
  faster due to incremental compilation and Stryker's caching.
- **Trivially equivalent mutants** (e.g., `a + b` ↔ `b + a` for commutative
  ops, swapping two equal literal strings) will count against the score.
  Stryker cannot auto-detect equivalent mutants. Adding `ignorePatterns` for
  known equivalent cases is out of scope for this cycle.
- `pnpm dlx` is not required — Stryker is installed as a devDependency and
  invoked directly via `pnpm exec stryker run` (or just `pnpm test:mutate`).
- `vitest.config.ts` at the workspace root will auto-discover the new
  `*.test.ts` files via its `test.include: ["packages/**/*.{test,spec}.ts"]`
  glob; no per-package vitest config is needed for this cycle.
