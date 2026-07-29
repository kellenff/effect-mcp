# Stryker Mutation-Testing Pilot — `packages/shared` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a working Stryker Mutator pipeline in `packages/shared` and document a baseline mutation-score for `schema.ts`, `error.ts`, and `mcp.ts`.

**Architecture:** Per-package Stryker config + per-package vitest test files (one per source file). Tests use plain vitest + `Effect.runSync` (no async needed in `shared`). Stryker re-uses the workspace-root `vitest.config.ts` and is paired with `@stryker-mutator/typescript-checker` so surviving mutants are also evaluated under `tsc --noEmit`. Aggregator script at the workspace root is wired but a no-op until the `client` / `server` cycles add their own configs.

**Tech Stack:** Stryker Mutator 9.6.1 (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner` + `@stryker-mutator/typescript-checker`), vitest 4.1.10 (already installed), effect/Schema + effect/Match (already in use), pnpm 9.14.2 workspaces.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `packages/shared/src/error.test.ts` | Unit tests for `JsonRpcErrorCode` enum values and `JsonRpcError` class (construction, `fromCode`, Schema round-trip). |
| `packages/shared/src/schema.test.ts` | Round-trip / valid-input / invalid-input / discriminated-union tests for every exported schema in `src/schema.ts`. |
| `packages/shared/src/mcp.test.ts` | Dispatcher tests for `handleMessage` covering all 8 rows of the priority matrix in the spec. |
| `packages/shared/stryker.config.mjs` | Per-package Stryker configuration (mutators, vitest runner, typescript checker, per-file thresholds, HTML reporter). |
| `packages/shared/reports/` | Stryker HTML + JSON output (generated, gitignored). |
| `docs/snowball/cycles/2026-07-28-stryker-shared-pilot-cycle-notes.md` | Baseline mutation scores + decision log for the cycle. |

### Modified

| Path | Change |
|---|---|
| `packages/shared/package.json` | Add `test:mutate` and `test:mutate:watch` scripts; add three `@stryker-mutator/*` devDependencies. |
| `package.json` (workspace root) | Add `test:mutate` aggregator script (`pnpm -r --if-present test:mutate`). |
| `.gitignore` | Add `**/reports/` so per-package Stryker output is ignored. |

---

## Task 1: Toolchain plumbing (deps, scripts, gitignore, aggregator)

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `package.json` (workspace root)
- Modify: `.gitignore`

- [ ] **Step 1: Update `packages/shared/package.json`**

Replace the file contents with the following (the only additions vs. the current file are the two new scripts and three new devDependencies):

```json
{
  "name": "@effect-mcp/shared",
  "version": "0.0.1",
  "private": true,
  "description": "Effect MCP Shared",
  "type": "module",
  "scripts": {
    "build": "pnpm run build:code && pnpm run build:types",
    "build:code": "tsup",
    "build:types": "rm -f tsconfig.tsbuildinfo && tsc --emitDeclarationOnly",
    "test:mutate": "stryker run",
    "test:mutate:watch": "stryker run --watch"
  },
  "keywords": [
    "effect",
    "mcp",
    "modelcontextprotocol"
  ],
  "author": "Garrett Hardin",
  "license": "MIT",
  "files": [
    "dist",
    "src"
  ],
  "exports": {
    ".": {
      "import": {
        "@effect-mcp/dev": "./src/index.ts",
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "@effect-mcp/dev": "./src/index.ts",
        "types": "./dist/index.d.ts",
        "default": "./dist/index.cjs"
      }
    },
    "./mcp": {
      "import": {
        "@effect-mcp/dev": "./src/mcp/mcp.ts",
        "types": "./dist/mcp/mcp.d.ts",
        "default": "./dist/mcp/mcp.js"
      },
      "require": {
        "@effect-mcp/dev": "./src/mcp/mcp.ts",
        "types": "./dist/mcp/mcp.d.ts",
        "default": "./dist/mcp/mcp.cjs"
      }
    },
    "./schema": {
      "import": {
        "@effect-mcp/dev": "./src/schema/schema.ts",
        "types": "./dist/schema/schema.d.ts",
        "default": "./dist/schema/schema.js"
      },
      "require": {
        "@effect-mcp/dev": "./src/schema/schema.ts",
        "types": "./dist/schema/schema.d.ts",
        "default": "./dist/schema/schema.cjs"
      }
    }
  },
  "peerDependencies": {
    "effect": "^3.22.0",
    "typescript": "^7.0.2"
  },
  "devDependencies": {
    "@stryker-mutator/core": "9.6.1",
    "@stryker-mutator/vitest-runner": "9.6.1",
    "@stryker-mutator/typescript-checker": "9.6.1",
    "tsup": "^8.5.1"
  }
}
```

- [ ] **Step 2: Update the workspace-root `package.json`**

Replace the file contents with the following (only the `scripts` block gains one new line — `test:mutate`):

```json
{
  "name": "effect-mcp",
  "version": "1.0.0",
  "type": "module",
  "description": "Effect MCP",
  "keywords": [
    "effect",
    "mcp",
    "modelcontextprotocol"
  ],
  "author": "Garrett Hardin",
  "license": "MIT",
  "scripts": {
    "build": "turbo run build",
    "build:watch": "turbo watch build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:bench": "vitest bench --run",
    "test:bench:watch": "vitest bench",
    "test:mutate": "pnpm -r --if-present test:mutate"
  },
  "devDependencies": {
    "@types/node": "^26.1.1",
    "turbo": "^2.10.7",
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  },
  "workspaces": [
    "examples/*",
    "packages/*"
  ],
  "packageManager": "pnpm@9.14.2"
}
```

- [ ] **Step 3: Update `.gitignore`**

Append `**/reports/` as a new line so the file becomes:

```
node_modules
dist
tsconfig.tsbuildinfo
.turbo
/.rag/lancedb/
**/reports/
```

- [ ] **Step 4: Install the new dependencies**

Run: `pnpm install`
Expected: completes without errors; `pnpm-lock.yaml` updates with the three Stryker packages. If `9.6.1` is not resolvable on npm, run `pnpm view @stryker-mutator/core version` to discover the latest published version and substitute that exact version (no `^`) in both `package.json` files from Steps 1 and 2.

- [ ] **Step 5: Verify Stryker is invocable**

Run: `pnpm exec stryker --version`
Expected: prints the Stryker version (e.g. `9.6.1`) and exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/package.json package.json .gitignore pnpm-lock.yaml
git commit -m "chore(shared): add Stryker mutation-testing toolchain"
```

---

## Task 2: Write `stryker.config.mjs`

**Files:**
- Create: `packages/shared/stryker.config.mjs`

- [ ] **Step 1: Create the config file**

Create `packages/shared/stryker.config.mjs` with the following content (verbatim from the design spec):

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

- [ ] **Step 2: Commit**

```bash
git add packages/shared/stryker.config.mjs
git commit -m "chore(shared): add per-package Stryker config"
```

Note: this config is not exercised until Task 8 — it is a static file. No tests for the config itself.

---

## Task 3: Write `error.test.ts`

**Files:**
- Create: `packages/shared/src/error.test.ts`

- [ ] **Step 1: Write the tests**

Create `packages/shared/src/error.test.ts` with the following content:

```ts
import { describe, it, expect } from "vitest";
import * as Schema from "effect/Schema";
import { JsonRpcError, JsonRpcErrorCode } from "./error.js";

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
      code: -32000,
      message: "closed",
      data: { reason: "timeout" },
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

  it("fromCode omits data when not provided", () => {
    const e = JsonRpcError.fromCode("InternalError", "oops");
    expect(e.data).toBeUndefined();
  });

  it("round-trips through Schema encode/decode", () => {
    const original = JsonRpcError.fromCode("InvalidParams", "x", { y: 1 });
    const encoded = Schema.encodeSync(JsonRpcError)(original);
    const decoded = Schema.decodeUnknownSync(JsonRpcError)(encoded);
    expect(decoded).toEqual(original);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test`
Expected: all tests pass — 7 new tests in `error.test.ts`, no other test files exist yet so nothing else to regress against.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/error.test.ts
git commit -m "test(shared): add JsonRpcError and JsonRpcErrorCode tests"
```

---

## Task 4: Write `schema.test.ts` — foundational + envelope schemas

**Files:**
- Create: `packages/shared/src/schema.test.ts`

- [ ] **Step 1: Write the foundational schema tests**

Create `packages/shared/src/schema.test.ts` with the following content:

```ts
import { describe, it, expect } from "vitest";
import * as Schema from "effect/Schema";
import {
  ProgressToken,
  Cursor,
  Request,
  Notification,
  Result,
  RequestId,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCMessage,
  EmptyResult,
} from "./schema.js";

describe("RequestId", () => {
  it("decodes a string id", () => {
    expect(Schema.decodeUnknownSync(RequestId)("abc")).toBe("abc");
  });

  it("decodes an integer number id", () => {
    expect(Schema.decodeUnknownSync(RequestId)(42)).toBe(42);
  });

  it("rejects non-integer numbers", () => {
    expect(() => Schema.decodeUnknownSync(RequestId)(1.5)).toThrow();
  });

  it("rejects booleans", () => {
    expect(() => Schema.decodeUnknownSync(RequestId)(true)).toThrow();
  });
});

describe("ProgressToken", () => {
  it("decodes a string token", () => {
    expect(Schema.decodeUnknownSync(ProgressToken)("t1")).toBe("t1");
  });

  it("decodes an integer token", () => {
    expect(Schema.decodeUnknownSync(ProgressToken)(7)).toBe(7);
  });

  it("rejects non-integer numbers", () => {
    expect(() => Schema.decodeUnknownSync(ProgressToken)(1.5)).toThrow();
  });
});

describe("Cursor", () => {
  it("decodes a string", () => {
    expect(Schema.decodeUnknownSync(Cursor)("c1")).toBe("c1");
  });

  it("rejects a number", () => {
    expect(() => Schema.decodeUnknownSync(Cursor)(42)).toThrow();
  });
});

describe("Request", () => {
  it("requires method", () => {
    expect(() => Schema.decodeUnknownSync(Request)({})).toThrow();
  });

  it("accepts a request with method and params", () => {
    const decoded = Schema.decodeUnknownSync(Request)({
      method: "ping",
      params: { _meta: { progressToken: "t1" } },
    });
    expect(decoded.method).toBe("ping");
  });
});

describe("Notification", () => {
  it("requires method", () => {
    expect(() => Schema.decodeUnknownSync(Notification)({})).toThrow();
  });
});

describe("Result", () => {
  it("decodes an empty result object", () => {
    expect(Schema.decodeUnknownSync(Result)({})).toEqual({});
  });
});

describe("EmptyResult", () => {
  it("round-trips an empty result", () => {
    const decoded = Schema.decodeUnknownSync(EmptyResult)({});
    expect(decoded).toEqual({});
  });
});

describe("JSONRPCRequest", () => {
  it("round-trips a request", () => {
    const original = { jsonrpc: "2.0" as const, id: 1, method: "ping" };
    const encoded = Schema.encodeSync(JSONRPCRequest)(original);
    expect(Schema.decodeUnknownSync(JSONRPCRequest)(encoded)).toEqual(original);
  });

  it("requires the jsonrpc literal '2.0'", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCRequest)({
        jsonrpc: "1.0",
        id: 1,
        method: "ping",
      })
    ).toThrow();
  });

  it("requires id", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCRequest)({
        jsonrpc: "2.0",
        method: "ping",
      })
    ).toThrow();
  });

  it("requires method", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCRequest)({ jsonrpc: "2.0", id: 1 })
    ).toThrow();
  });

  it("accepts a string id", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCRequest)({
      jsonrpc: "2.0",
      id: "req-1",
      method: "ping",
    });
    expect(decoded.id).toBe("req-1");
  });
});

describe("JSONRPCNotification", () => {
  it("round-trips a notification (no id)", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/initialized",
    };
    const encoded = Schema.encodeSync(JSONRPCNotification)(original);
    expect(Schema.decodeUnknownSync(JSONRPCNotification)(encoded)).toEqual(original);
  });
});

describe("JSONRPCResponse", () => {
  it("round-trips a response", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      result: { value: true },
    };
    const encoded = Schema.encodeSync(JSONRPCResponse)(original);
    expect(Schema.decodeUnknownSync(JSONRPCResponse)(encoded)).toEqual(original);
  });

  it("requires result", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCResponse)({ jsonrpc: "2.0", id: 1 })
    ).toThrow();
  });
});

describe("JSONRPCError", () => {
  it("round-trips an error", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      error: { code: -32600, message: "invalid" },
    };
    const encoded = Schema.encodeSync(JSONRPCError)(original);
    expect(Schema.decodeUnknownSync(JSONRPCError)(encoded)).toEqual(original);
  });

  it("requires error.code to be an integer", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCError)({
        jsonrpc: "2.0",
        id: 1,
        error: { code: 1.5, message: "x" },
      })
    ).toThrow();
  });

  it("requires error.message", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCError)({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600 },
      })
    ).toThrow();
  });
});

describe("JSONRPCMessage", () => {
  it("decodes a request", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    expect(decoded).toMatchObject({ jsonrpc: "2.0", id: 1, method: "ping" });
  });

  it("decodes a notification", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(decoded).toMatchObject({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  });

  it("decodes a response", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    });
    expect(decoded).toMatchObject({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("decodes an error", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "x" },
    });
    expect(decoded).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "x" },
    });
  });

  it("rejects messages missing jsonrpc", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCMessage)({ id: 1, method: "ping" })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test`
Expected: all tests pass — both `error.test.ts` (7 tests) and `schema.test.ts` (~25 tests) pass. No regressions.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schema.test.ts
git commit -m "test(shared): add foundational and envelope schema tests"
```

---

## Task 5: Extend `schema.test.ts` with protocol message tests

**Files:**
- Modify: `packages/shared/src/schema.test.ts` (append describe blocks)

- [ ] **Step 1: Append protocol-message describe blocks**

Add the following content to the end of `packages/shared/src/schema.test.ts` (after the `JSONRPCMessage` describe block, before any other code). Insert these `describe` blocks inside the existing import-by-name list — also update the import at the top of the file to include the new schemas being tested:

Update the import line at the top of the file from:

```ts
import {
  ProgressToken,
  Cursor,
  Request,
  Notification,
  Result,
  RequestId,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCMessage,
  EmptyResult,
} from "./schema.js";
```

to:

```ts
import {
  ProgressToken,
  Cursor,
  Request,
  Notification,
  Result,
  RequestId,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCMessage,
  EmptyResult,
  Implementation,
  ClientCapabilities,
  InitializeRequest,
  InitializeResult,
  InitializedNotification,
  PingRequest,
  CancelledNotification,
  Progress,
  ProgressNotification,
  PaginatedRequest,
  PaginatedResult,
  LoggingLevel,
  SetLevelRequest,
  LoggingMessageNotification,
  ListRootsRequest,
  ListRootsResult,
  RootsListChangedNotification,
  Root,
} from "./schema.js";
```

Then append these describe blocks at the end of the file:

```ts
describe("Implementation", () => {
  it("requires name and version", () => {
    expect(() =>
      Schema.decodeUnknownSync(Implementation)({ name: "x" })
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Implementation)({ version: "1.0" })
    ).toThrow();
  });

  it("decodes a valid implementation", () => {
    const decoded = Schema.decodeUnknownSync(Implementation)({
      name: "test",
      version: "1.0.0",
    });
    expect(decoded).toEqual({ name: "test", version: "1.0.0" });
  });
});

describe("ClientCapabilities", () => {
  it("decodes an empty capabilities object", () => {
    const decoded = Schema.decodeUnknownSync(ClientCapabilities)({});
    expect(decoded).toEqual({});
  });

  it("decodes roots.listChanged boolean", () => {
    const decoded = Schema.decodeUnknownSync(ClientCapabilities)({
      roots: { listChanged: true },
    });
    expect(decoded.roots?.listChanged).toBe(true);
  });
});

describe("InitializeRequest", () => {
  const valid = {
    method: "initialize" as const,
    jsonrpc: "2.0" as const,
    id: 1,
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  };

  it("round-trips an initialize request", () => {
    const encoded = Schema.encodeSync(InitializeRequest)(valid);
    expect(Schema.decodeUnknownSync(InitializeRequest)(encoded)).toEqual(valid);
  });

  it("requires protocolVersion", () => {
    expect(() =>
      Schema.decodeUnknownSync(InitializeRequest)({
        ...valid,
        params: { ...valid.params, protocolVersion: undefined as unknown as string },
      })
    ).toThrow();
  });

  it("requires clientInfo", () => {
    expect(() =>
      Schema.decodeUnknownSync(InitializeRequest)({
        ...valid,
        params: { ...valid.params, clientInfo: undefined as unknown as { name: string; version: string } },
      })
    ).toThrow();
  });
});

describe("InitializeResult", () => {
  const valid = {
    jsonrpc: "2.0" as const,
    protocolVersion: "2024-11-05",
    capabilities: {},
    serverInfo: { name: "srv", version: "1.0.0" },
  };

  it("round-trips an initialize result", () => {
    const encoded = Schema.encodeSync(InitializeResult)(valid);
    expect(Schema.decodeUnknownSync(InitializeResult)(encoded)).toEqual(valid);
  });

  it("requires serverInfo", () => {
    expect(() =>
      Schema.decodeUnknownSync(InitializeResult)({
        ...valid,
        serverInfo: undefined as unknown as { name: string; version: string },
      })
    ).toThrow();
  });
});

describe("InitializedNotification", () => {
  it("round-trips an initialized notification", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/initialized" as const,
    };
    const encoded = Schema.encodeSync(InitializedNotification)(original);
    expect(Schema.decodeUnknownSync(InitializedNotification)(encoded)).toEqual(original);
  });
});

describe("PingRequest", () => {
  it("round-trips a ping request", () => {
    const original = { jsonrpc: "2.0" as const, id: 1, method: "ping" as const };
    const encoded = Schema.encodeSync(PingRequest)(original);
    expect(Schema.decodeUnknownSync(PingRequest)(encoded)).toEqual(original);
  });

  it("rejects non-ping methods", () => {
    expect(() =>
      Schema.decodeUnknownSync(PingRequest)({
        jsonrpc: "2.0",
        id: 1,
        method: "other",
      })
    ).toThrow();
  });
});

describe("CancelledNotification", () => {
  it("round-trips a cancelled notification with reason", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/cancelled" as const,
      params: { requestId: 42, reason: "user abort" },
    };
    const encoded = Schema.encodeSync(CancelledNotification)(original);
    expect(Schema.decodeUnknownSync(CancelledNotification)(encoded)).toEqual(original);
  });

  it("round-trips a cancelled notification without reason", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/cancelled" as const,
      params: { requestId: 42 },
    };
    const encoded = Schema.encodeSync(CancelledNotification)(original);
    expect(Schema.decodeUnknownSync(CancelledNotification)(encoded)).toEqual(original);
  });

  it("requires requestId", () => {
    expect(() =>
      Schema.decodeUnknownSync(CancelledNotification)({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: {},
      })
    ).toThrow();
  });
});

describe("Progress", () => {
  it("requires progress", () => {
    expect(() => Schema.decodeUnknownSync(Progress)({})).toThrow();
  });

  it("decodes progress with optional total", () => {
    const decoded = Schema.decodeUnknownSync(Progress)({
      progress: 50,
      total: 100,
    });
    expect(decoded.progress).toBe(50);
    expect(decoded.total).toBe(100);
  });
});

describe("ProgressNotification", () => {
  it("round-trips a progress notification", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/progress" as const,
      params: { progressToken: "t1", progress: 50, total: 100 },
    };
    const encoded = Schema.encodeSync(ProgressNotification)(original);
    expect(Schema.decodeUnknownSync(ProgressNotification)(encoded)).toEqual(original);
  });
});

describe("PaginatedRequest", () => {
  it("round-trips with no params", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "resources/list" as const,
    };
    const encoded = Schema.encodeSync(PaginatedRequest)(original);
    expect(Schema.decodeUnknownSync(PaginatedRequest)(encoded)).toEqual(original);
  });

  it("round-trips with cursor", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "resources/list" as const,
      params: { cursor: "c1" },
    };
    const encoded = Schema.encodeSync(PaginatedRequest)(original);
    expect(Schema.decodeUnknownSync(PaginatedRequest)(encoded)).toEqual(original);
  });
});

describe("PaginatedResult", () => {
  it("decodes an empty paginated result", () => {
    const decoded = Schema.decodeUnknownSync(PaginatedResult)({});
    expect(decoded).toEqual({});
  });

  it("decodes with nextCursor", () => {
    const decoded = Schema.decodeUnknownSync(PaginatedResult)({
      nextCursor: "c2",
    });
    expect(decoded.nextCursor).toBe("c2");
  });
});

describe("LoggingLevel", () => {
  it("accepts each valid level", () => {
    for (const level of [
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ]) {
      expect(Schema.decodeUnknownSync(LoggingLevel)(level)).toBe(level);
    }
  });

  it("rejects unknown levels", () => {
    expect(() => Schema.decodeUnknownSync(LoggingLevel)("trace")).toThrow();
  });
});

describe("SetLevelRequest", () => {
  it("round-trips a set-level request", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "logging/setLevel" as const,
      params: { level: "debug" as const },
    };
    const encoded = Schema.encodeSync(SetLevelRequest)(original);
    expect(Schema.decodeUnknownSync(SetLevelRequest)(encoded)).toEqual(original);
  });
});

describe("LoggingMessageNotification", () => {
  it("round-trips a logging message notification", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/message" as const,
      params: { level: "error" as const, logger: "x", data: { msg: "boom" } },
    };
    const encoded = Schema.encodeSync(LoggingMessageNotification)(original);
    expect(Schema.decodeUnknownSync(LoggingMessageNotification)(encoded)).toEqual(original);
  });
});

describe("ListRootsRequest", () => {
  it("round-trips a list-roots request", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "roots/list" as const,
    };
    const encoded = Schema.encodeSync(ListRootsRequest)(original);
    expect(Schema.decodeUnknownSync(ListRootsRequest)(encoded)).toEqual(original);
  });
});

describe("ListRootsResult", () => {
  it("round-trips with one root", () => {
    const original = {
      jsonrpc: "2.0" as const,
      roots: [{ uri: "file:///tmp", name: "tmp" }],
    };
    const encoded = Schema.encodeSync(ListRootsResult)(original);
    expect(Schema.decodeUnknownSync(ListRootsResult)(encoded)).toEqual(original);
  });

  it("rejects a non-file:// root uri", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListRootsResult)({
        jsonrpc: "2.0",
        roots: [{ uri: "http://example.com" }],
      })
    ).toThrow();
  });
});

describe("Root", () => {
  it("requires uri starting with file://", () => {
    expect(() =>
      Schema.decodeUnknownSync(Root)({ uri: "/tmp" })
    ).toThrow();
  });
});

describe("RootsListChangedNotification", () => {
  it("round-trips a roots-list-changed notification", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/roots/list_changed" as const,
    };
    const encoded = Schema.encodeSync(RootsListChangedNotification)(original);
    expect(Schema.decodeUnknownSync(RootsListChangedNotification)(encoded)).toEqual(original);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test`
Expected: all tests pass — `error.test.ts`, the foundational portion of `schema.test.ts` (Task 4), and the protocol-message portion from this task all green. No regressions.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schema.test.ts
git commit -m "test(shared): add protocol-message schema tests"
```

---

## Task 6: Write `mcp.test.ts` (dispatcher priority matrix)

**Files:**
- Create: `packages/shared/src/mcp.test.ts`

- [ ] **Step 1: Write the dispatcher tests**

Create `packages/shared/src/mcp.test.ts` with the following content (the mock helper and `dispatch` shape come verbatim from the design spec):

```ts
import { describe, it, expect, vi } from "vitest";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import { handleMessage, MCP } from "./mcp.js";
import type { JSONRPCMessage } from "./schema.js";

const makeMockService = () => {
  const calls: Array<{ kind: string; msg: unknown }> = [];
  const tag =
    <K extends string>(kind: K) =>
    (msg: unknown): Effect.Effect<void> => {
      calls.push({ kind, msg });
      return Effect.void;
    };
  return {
    service: {
      handleError: vi.fn().mockImplementation(tag("handleError")),
      handleResponse: vi.fn().mockImplementation(tag("handleResponse")),
      handleRequest: vi.fn().mockImplementation(tag("handleRequest")),
      handleNotification: vi.fn().mockImplementation(tag("handleNotification")),
    },
    calls,
  };
};

const dispatch = (message: JSONRPCMessage, service: MCP.Service) =>
  Effect.runSync(
    pipe(handleMessage(message), Effect.provideService(MCP, service))
  );

const req = (id: number | string) => ({
  jsonrpc: "2.0" as const,
  id,
  method: "ping",
});

const notif = () => ({
  jsonrpc: "2.0" as const,
  method: "notifications/initialized",
});

const resp = (id: number | string) => ({
  jsonrpc: "2.0" as const,
  id,
  result: {},
});

const err = (id: number | string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code: -32600, message: "invalid" },
});

const only = (service: ReturnType<typeof makeMockService>["service"], kind: keyof typeof service) => {
  for (const k of Object.keys(service) as Array<keyof typeof service>) {
    if (k !== kind) expect(service[k]).not.toHaveBeenCalled();
  }
  expect(service[kind]).toHaveBeenCalledTimes(1);
};

describe("handleMessage", () => {
  it("dispatches messages with an error field to handleError (priority over id/result)", () => {
    const { service } = makeMockService();
    dispatch(err(1) as unknown as JSONRPCMessage, service);
    only(service, "handleError");
  });

  it("dispatches messages with a result field to handleResponse (priority over id)", () => {
    const { service } = makeMockService();
    dispatch(resp(1) as unknown as JSONRPCMessage, service);
    only(service, "handleResponse");
  });

  it("dispatches messages with id (and no result/error) to handleRequest", () => {
    const { service } = makeMockService();
    dispatch(req(1) as unknown as JSONRPCMessage, service);
    only(service, "handleRequest");
  });

  it("dispatches messages without id to handleNotification (orElse fallback)", () => {
    const { service } = makeMockService();
    dispatch(notif() as unknown as JSONRPCMessage, service);
    only(service, "handleNotification");
  });

  it("treats { error: null } as present and dispatches to handleError", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, error: null } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleError");
  });

  it("treats { result: null } as present and dispatches to handleResponse", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, result: null } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleResponse");
  });

  it("treats a non-object result string as not-present, falling through to handleRequest", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, result: "string" } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleRequest");
  });

  it("treats a non-object error string as not-present, falling through to handleRequest", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, error: "string" } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleRequest");
  });

  it("prioritizes error over result when both are present", () => {
    const { service } = makeMockService();
    dispatch(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {},
        error: { code: -32600, message: "invalid" },
      } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleError");
  });

  it("passes the original message to the chosen handler", () => {
    const { service } = makeMockService();
    const message = req(7);
    dispatch(message as unknown as JSONRPCMessage, service);
    expect(service.handleRequest).toHaveBeenCalledWith(message);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test`
Expected: all tests pass — `error.test.ts` (7), `schema.test.ts` (foundational + protocol), `mcp.test.ts` (10) all green. No regressions.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/mcp.test.ts
git commit -m "test(shared): add handleMessage dispatcher tests for priority matrix"
```

---

## Task 7: Run the full workspace test suite (no-regression check)

**Files:** none

- [ ] **Step 1: Run all tests at the workspace root**

Run: `pnpm test`
Expected: all test files pass; no failures, no timeouts.

- [ ] **Step 2: Run tsc to confirm type-safety of the new tests**

Run: `pnpm --filter @effect-mcp/shared exec tsc --noEmit`
Expected: exits 0 with no type errors. This proves the test files type-check cleanly (and is the same check Stryker's typescript-checker will run against surviving mutants).

- [ ] **Step 3: No commit needed**

This task is a verification gate. If either step fails, fix the underlying issue in Tasks 3–6 and re-run before proceeding to Task 8.

---

## Task 8: Run the first mutation baseline

**Files:** none at first; eventually the cycle notes from Task 9 are created and committed.

- [ ] **Step 1: Clear any prior reports and run the mutator**

Run:
```bash
rm -rf packages/shared/reports
pnpm --filter @effect-mcp/shared test:mutate
```
Expected: stryker runs against `src/mcp.ts`, `src/error.ts`, `src/schema.ts`. Expect 5–15 minutes for the first baseline (per the spec's known-limits section). The command exits non-zero if any per-file mutation score is below its `low` threshold — that is acceptable on this first run per the acceptance criteria.

- [ ] **Step 2: Inspect the clear-text output and the JSON report**

Run:
```bash
cat packages/shared/reports/mutation.json | head -200
```
Expected: a JSON report listing killed/timeout/survive/no-cover counts per file, plus `typescript-checker` results as separate counters. Capture these numbers for Task 9.

- [ ] **Step 3: Decide: gate met, or tune**

For each of `mcp.ts`, `error.ts`, `schema.ts`, compare the mutation score against the per-file `low` threshold from `stryker.config.mjs`:

- `mcp.ts` low = 90
- `error.ts` low = 80
- `schema.ts` low = 50

If every per-file score is at or above its `low` threshold, proceed to Task 9 without changes.

If any per-file score is below its `low` threshold, follow the acceptance-criteria escape clause: tune tests or thresholds to a realistic level. The two common tunings are:

1. **Add more tests** for surviving mutants in that file — extend the relevant `*.test.ts` and re-run `pnpm --filter @effect-mcp/shared test:mutate`.
2. **Adjust the threshold** in `packages/shared/stryker.config.mjs` to the actual measured baseline (e.g., drop `schema.ts` `low` from 50 to 40) and commit the change with a message that explains the new baseline.

Either way, document the decision and measured score in Task 9.

- [ ] **Step 4: No commit yet**

Cycle notes (Task 9) capture the baseline numbers and any tuning decisions.

---

## Task 9: Document baseline + create cycle notes

**Files:**
- Create: `docs/snowball/cycles/2026-07-28-stryker-shared-pilot-cycle-notes.md`

- [ ] **Step 1: Write the cycle notes**

Create `docs/snowball/cycles/2026-07-28-stryker-shared-pilot-cycle-notes.md` with the following template, filling in the placeholders with the numbers from Task 8:

```markdown
# Stryker Pilot — `packages/shared` Cycle Notes

| Field       | Value                                                    |
|-------------|----------------------------------------------------------|
| Date        | 2026-07-28                                               |
| Cycle       | Pilot (step 1 of N — `client` and `server` follow)        |
| Spec        | `docs/snowball/specs/2026-07-28-stryker-shared-pilot-design.md` |
| Plan        | `docs/snowball/plans/2026-07-28-stryker-shared-pilot-design.md`  |
| Branch      | <branch-name>                                            |
| Stryker     | 9.6.1                                                    |
| Vitest      | 4.1.10                                                   |

## Baseline mutation scores

| File            | Killed | Survived | Timeout | No-cover | Score  | Low threshold | High threshold | Status |
|-----------------|--------|----------|---------|----------|--------|---------------|----------------|--------|
| `mcp.ts`        |        |          |         |          |        | 90            | 95             |        |
| `error.ts`      |        |          |         |          |        | 80            | 85             |        |
| `schema.ts`     |        |          |         |          |        | 50            | 70             |        |

## typescript-checker results

| File            | Killed by checker | Survived checker | Notes |
|-----------------|-------------------|------------------|-------|
| `mcp.ts`        |                   |                  |       |
| `error.ts`      |                   |                  |       |
| `schema.ts`     |                   |                  |       |

## Decisions

- (If a threshold was tuned, record: "Lowered `schema.ts` `low` threshold from 50 to 40 to reflect the actual baseline; rationale: <reason>.")
- (If tests were added, record which describe blocks were added and why.)

## Out-of-scope follow-ups (carried from the design)

- Tests in `packages/client` (33 KB source) — next cycle.
- Tests in `packages/server` (22 KB source) — next cycle.
- Activating the workspace-root `pnpm test:mutate` aggregator across all 3 packages.
- Wiring `test:mutate` into `turbo.json` for CI integration.
- Treating the `// TODO: Implement` stubs in `server.ts` and `client.ts` via `stryker.ignorePatterns`.
```

- [ ] **Step 2: Commit the cycle notes (and any tuned config)**

If a threshold was tuned in Task 8 Step 3:
```bash
git add packages/shared/stryker.config.mjs docs/snowball/cycles/2026-07-28-stryker-shared-pilot-cycle-notes.md
git commit -m "docs(snowball): record Stryker pilot baseline and tuned thresholds"
```

Otherwise (no tuning needed):
```bash
git add docs/snowball/cycles/2026-07-28-stryker-shared-pilot-cycle-notes.md
git commit -m "docs(snowball): record Stryker pilot baseline scores"
```

---

## Self-Review

**1. Spec coverage:**

| Spec requirement | Implemented by |
|---|---|
| Per-package `stryker.config.mjs` with all fields from the spec | Task 2 |
| `packages/shared/package.json` — scripts + 3 devDependencies | Task 1 |
| Workspace-root `package.json` — `test:mutate` aggregator | Task 1 |
| `.gitignore` — `**/reports/` | Task 1 |
| `error.ts` test surface (5 unit tests per spec + extras) | Task 3 |
| `schema.ts` test surface (round-trip, valid, invalid, discriminated-union) | Tasks 4 + 5 |
| `mcp.ts` test surface (8-row priority matrix + extra pass-through) | Task 6 |
| `pnpm test` continues to pass | Task 7 |
| First mutation baseline documented | Tasks 8 + 9 |
| Per-file thresholds: mcp.ts 90/95, error.ts 80/85, schema.ts 50/70 | Task 2 |
| Cycle notes document the baseline | Task 9 |
| Aggregator is wired (no-op until later cycles) | Task 1 |
| `typescript-checker` results included in report | Task 8 reads JSON, Task 9 documents counts |

No spec gaps.

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "add appropriate error handling", "similar to Task N", or unfilled test skeletons. Every code change ships full content.

**3. Type consistency:**

- `MCP.Service` is referenced identically in `mcp.ts` and `mcp.test.ts` (`handleError`, `handleResponse`, `handleRequest`, `handleNotification`).
- `JSONRPCMessage` is the dispatch input type in both `mcp.ts` (`handleMessage: (message: JSONRPCMessage) => ...`) and `mcp.test.ts` (`dispatch: (message: JSONRPCMessage, service: MCP.Service) => ...`).
- `JsonRpcError.fromCode` signature in `error.ts` is `(cause: keyof typeof JsonRpcErrorCode, message: string, data?: unknown)` and is exercised identically in `error.test.ts`.
- Schema import names in `schema.test.ts` match the exported names in `schema.ts` exactly (verified by reading both files).
- The mock helper in `mcp.test.ts` returns `Effect.void` from each tag function (typed as `Effect.Effect<void>`) — this is what `handleMessage`'s `Effect.flatMap((mcp) => mcp.handleError(msg))` requires.

No inconsistencies.

---

## Execution Handoff

**Plan complete and saved to `docs/snowball/plans/2026-07-28-stryker-shared-pilot-design.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Use `snowball:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `snowball:executing-plans`, batch execution with checkpoints.

**Blast-radius note:** self-skipped per the `snowball:blast-radius` self-gate. This is a 6-file, single-package change (4 created, 3 modified) with all paths tightly clustered under `packages/shared/` and `docs/snowball/`; no cross-package import changes, no public API changes, no build-system surprises. The yactt graph is also unavailable for this repo (`.snowball/` absent, no MCP server registered). Running `compute-and-persist` would just produce a git-diff heuristic report that adds no signal beyond what is already in the File Structure table above.

Which approach?
