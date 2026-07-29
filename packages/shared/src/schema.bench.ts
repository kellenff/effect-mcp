import { bench, describe } from "vitest";
import {
  CallToolRequest,
  CallToolResult,
  CancelledNotification,
  EmptyResult,
  InitializeRequest,
  InitializeResult,
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  ListToolsRequest,
  ListToolsResult,
  PingRequest,
  ProgressNotification,
} from "./schema.js";
import * as Schema from "effect/Schema";

const pingRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "ping",
  id: "1",
});

const pingRequestJS = {
  jsonrpc: "2.0",
  method: "ping",
  id: "1",
};

const initializeRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "bench", version: "0.0.1" },
  },
  id: "2",
});

const initializeRequestJS = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "bench", version: "0.0.1" },
  },
  id: "2",
};

const callToolRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "Echo",
    arguments: { message: "hello world" },
  },
  id: "3",
});

const callToolRequestJS = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "Echo",
    arguments: { message: "hello world" },
  },
  id: "3",
};

const listToolsRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "tools/list",
  id: "4",
});

const listToolsRequestJS = {
  jsonrpc: "2.0",
  method: "tools/list",
  id: "4",
};

const notification: JSONRPCNotification = {
  jsonrpc: "2.0",
  method: "notifications/cancelled",
  params: { requestId: "1", reason: "test" },
};

/**
 * Minimal-viable `JSONRPCNotification` fixture used by the
 * `Schema decode from plain JS > JSONRPCNotification` and
 * `Schema encode to plain JS > JSONRPCNotification` benchmarks.
 *
 * It is the simplest valid progress notification the bench file
 * produces — a single half-completed item — so the encode /
 * decode timings reflect the envelope itself (`jsonrpc`,
 * `method`, top-level `params` discrimination,
 * `progressToken` parsing) without the cost of a realistic
 * multi-call chain.
 *
 * Field shape:
 *   - `method: "notifications/progress"` — required to
 *     discriminate this notification from any other; the
 *     server / client demuxer routes on this string.
 *   - `params.progressToken: "tok-1"` — opaque string that ties
 *     the notification back to the originating request (the
 *     caller provided this on `_meta.progressToken` of the
 *     request). `"tok-1"` is intentionally short and stable so
 *     the fixture is easy to identify in bench output.
 *   - `params.progress: 0.5` — current progress fraction. `0.5`
 *     is chosen (rather than `0`) so the encoder exercises
 *     non-zero numeric formatting.
 *   - `params.total: 1` — small whole-number denominator so the
 *     shape decodes as a complete `{ progress, total }` (not the
 *     "unknown total" branch). Set to `1` to keep the fixture
 *     obviously synthetic.
 *
 * Decoded against `Progress` in `@effect-mcp/shared/schema` —
 * see that schema's docs for the wire contract.
 */
const progressNotification: JSONRPCNotification = {
  jsonrpc: "2.0",
  method: "notifications/progress",
  params: {
    progressToken: "tok-1",
    progress: 0.5,
    total: 1,
  },
};

/**
 * Minimal-viable `JSONRPCResponse` fixture used by the
 * `Schema decode from plain JS > JSONRPCResponse` and
 * `Schema encode to plain JS > JSONRPCResponse` benchmarks.
 *
 * It is the *simplest valid response* the bench file produces — a
 * pong-shaped answer with only `_meta` in the result, no real domain
 * payload — so the encode/decode timings reflect the schema envelope
 * itself (`jsonrpc`, `id`, top-level `result` discrimination, `_meta`
 * propagation) without the cost of a realistic `CallToolResult` or
 * `ListToolsResult` body. The richer `callToolResult` /
 * `callToolResultJS` fixtures cover those paths separately.
 *
 * The id `"1"` is intentionally shared with `pingRequest` so the
 * same response can also be used as the matching answer for a
 * `Ping` round-trip — see the "Round-trip encode + decode >
 * PingRequest" bench lower in the file.
 *
 * Field shape:
 *   - `jsonrpc: "2.0"` — required version tag.
 *   - `id: "1"`        — the "first" request id, shared with
 *                        `pingRequest` for round-trips.
 *   - `result: { _meta: { pong: true } }` — a single `_meta` flag,
 *                        conventionally carried by MCP ping replies
 *                        to identify them as such (here simply a
 *                        boolean).
 */
const response: JSONRPCResponse = {
  jsonrpc: "2.0",
  id: "1",
  result: { _meta: { pong: true } },
};

const errorMessage: JSONRPCError = {
  jsonrpc: "2.0",
  id: "1",
  error: { code: -32601, message: "Method not found" },
};

/**
 * Fixture used by the encode / round-trip benchmarks for the
 * `tools/call` **happy path** — the model's typical innermost loop
 * message shape.
 *
 * Built with `JSONRPCResponse.make(...)` (the schema factory) rather
 * than the plain-JS object form (`callToolResultJS`) because the
 * `Schema encode to plain JS > JSONRPCResponse (CallToolResult)` and
 * `Round-trip encode + decode > CallToolResult` benchmarks exercise
 * the encode path on a value that *already* satisfies the schema.
 * That isolates the measured work to encoding itself, not to
 * structural fix-up or coercion.
 *
 * The leading spread (`...`) lets any defaults the factory adds
 * (`_meta`, etc.) flow through this const unchanged, so it stays
 * bit-for-bit equivalent to what a freshly-validated server response
 * would look like on the wire.
 *
 * Shape:
 *   - `id: "5"`        — the fourth unique request id (after ping,
 *                        initialize, call/list-tools), dedicated to
 *                        result fixtures to avoid id collisions
 *                        across the bench file.
 *   - `result.content` — a single text content item with the echo
 *                        payload `"Echo: hello world"`.
 *   - `result.isError` — `false` (happy path; error-shaped responses
 *                        are benchmarked separately via
 *                        `errorMessage`).
 */
const callToolResult = {
  ...JSONRPCResponse.make({
    jsonrpc: "2.0",
    id: "5",
    result: {
      content: [{ type: "text", text: "Echo: hello world" }],
      isError: false,
    },
  }),
};

const callToolResultJS = {
  jsonrpc: "2.0",
  id: "5",
  result: {
    content: [{ type: "text", text: "Echo: hello world" }],
    isError: false,
  },
};

describe("Schema decode from plain JS", () => {
  bench("JSONRPCMessage.union (PingRequest)", () => {
    Schema.decodeUnknownSync(JSONRPCMessage)(pingRequestJS);
  });

  bench("ClientRequest.union (Initialize)", () => {
    Schema.decodeUnknownSync(InitializeRequest)(initializeRequestJS);
  });

  bench("ClientRequest.union (CallTool)", () => {
    Schema.decodeUnknownSync(CallToolRequest)(callToolRequestJS);
  });

  bench("ClientRequest.union (ListTools)", () => {
    Schema.decodeUnknownSync(ListToolsRequest)(listToolsRequestJS);
  });

  bench("JSONRPCNotification (cancelled)", () => {
    Schema.decodeUnknownSync(CancelledNotification)(notification);
  });

  /**
   * Decode-throughput bench for `JSONRPCNotification` when the
   * notification payload is a `notifications/progress` payload.
   *
   * Subject: the `progressNotification` fixture declared above
   * (a `JSONRPCNotification` with
   * `method: "notifications/progress"` and a
   * `{ progressToken, progress, total }` params block).
   *
   * Operation: `Schema.decodeUnknownSync(ProgressNotification)` —
   *   - validates the envelope (`jsonrpc`, `method`,
   *     top-level `params` discrimination),
   *   - discriminates `method` against the `ProgressNotification`
   *     tagged-union branch,
   *   - parses `params.progressToken` against `ProgressToken`
   *     (the `string | int` union defined in `shared/schema.ts`)
   *     and `progress` / `total` against `Progress`.
   *
   * Pairs with the "Round-trip encode + decode >
   * JSONRPCNotification (progress)" bench just below to provide
   * the **decode half** in isolation. The encode half is
   * exercised by the `Schema encode to plain JS >
   * JSONRPCNotification` bench at the top of this file (which
   * uses a different fixture).
   */
  bench("JSONRPCNotification (progress)", () => {
    Schema.decodeUnknownSync(ProgressNotification)(progressNotification);
  });

  bench("JSONRPCResponse", () => {
    Schema.decodeUnknownSync(JSONRPCResponse)(response);
  });

  bench("JSONRPCError", () => {
    Schema.decodeUnknownSync(JSONRPCError)(errorMessage);
  });

  bench("PingRequest (narrowest)", () => {
    Schema.decodeUnknownSync(PingRequest)(pingRequestJS);
  });

  bench("CallToolResult", () => {
    Schema.decodeUnknownSync(CallToolResult)(callToolResultJS.result);
  });
});

describe("Schema encode to plain JS", () => {
  bench("JSONRPCMessage (PingRequest)", () => {
    Schema.encodeSync(JSONRPCMessage)(pingRequest);
  });

  bench("InitializeRequest", () => {
    Schema.encodeSync(InitializeRequest)(initializeRequest);
  });

  bench("CallToolRequest", () => {
    Schema.encodeSync(CallToolRequest)(callToolRequest);
  });

  bench("ListToolsRequest", () => {
    Schema.encodeSync(ListToolsRequest)(listToolsRequest);
  });

  bench("JSONRPCNotification (cancelled)", () => {
    Schema.encodeSync(JSONRPCNotification)(notification);
  });

  bench("JSONRPCResponse", () => {
    Schema.encodeSync(JSONRPCResponse)(response);
  });

  bench("EmptyResult", () => {
    Schema.encodeSync(EmptyResult)({ _meta: { pong: true } });
  });

  bench("JSONRPCResponse (CallToolResult)", () => {
    Schema.encodeSync(JSONRPCResponse)(callToolResult);
  });

  bench("ListToolsResult (10 tools)", () => {
    Schema.encodeSync(ListToolsResult)({
      tools: Array.from({ length: 10 }, (_, i) => ({
        name: `tool_${i}`,
        description: `Tool number ${i}`,
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
      })),
    });
  });

  bench("InitializeResult", () => {
    Schema.encodeSync(InitializeResult)({
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        resourceTemplates: {},
      },
      serverInfo: { name: "bench", version: "0.0.1" },
    });
  });
});

describe("Round-trip encode + decode", () => {
  bench("PingRequest", () => {
    const encoded = Schema.encodeSync(JSONRPCMessage)(pingRequest);
    Schema.decodeUnknownSync(JSONRPCMessage)(encoded);
  });

  bench("CallToolRequest", () => {
    const encoded = Schema.encodeSync(JSONRPCMessage)(callToolRequest);
    Schema.decodeUnknownSync(JSONRPCMessage)(encoded);
  });

  bench("CallToolResult", () => {
    const encoded = Schema.encodeSync(JSONRPCResponse)(callToolResult);
    Schema.decodeUnknownSync(JSONRPCResponse)(encoded);
  });
});
