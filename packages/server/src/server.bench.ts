import { bench, describe } from "vitest";
import { McpServer, Messenger } from "@effect-mcp/server";
import { MCP, RequestId } from "@effect-mcp/shared";
import * as AiTool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as LogLevel from "effect/LogLevel";
import * as Logger from "effect/Logger";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

const Echo = AiTool.make("Echo", {
  description: "Echo a message",
  parameters: { message: Schema.String },
  success: Schema.String,
});

const Count = AiTool.make("Count", {
  description: "Counts to N",
  parameters: { n: Schema.Number },
  success: Schema.Number,
});

const toolkit = Toolkit.make(Echo, Count);

const handlers = toolkit.toLayer({
  Echo: ({ message }) => Effect.succeed(`Echo: ${message}`),
  Count: ({ n }) =>
    Effect.sync(() => {
      let total = 0;
      for (let i = 0; i < n; i++) total += i;
      return total;
    }),
});

const config = { name: "bench", version: "0.0.1" };

/**
 * Builds a self-contained effect that creates the server (and a quiet
 * outbound drain) once, then runs the supplied program. Use this to
 * repeat many `handleRequest` calls inside the same scope so the
 * per-request work is what's measured.
 */
const withServer = <A, E>(
  program: (mcp: MCP.Service) => Effect.Effect<A, E, Scope.Scope>
): Effect.Effect<A, E, never> =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const messenger = yield* Messenger;
      const server = yield* McpServer.make(config, toolkit);

      yield* Stream.fromPubSub(messenger.outbound).pipe(
        Stream.runDrain,
        Effect.fork
      );

      return yield* program(server).pipe(
        Effect.provideService(Scope.Scope, scope)
      );
    })
  ).pipe(
    Effect.provide(Messenger.Default),
    Effect.provide(handlers),
    Logger.withMinimumLogLevel(LogLevel.None)
  );

const pingReq = (id: string) => ({
  jsonrpc: "2.0" as const,
  id: RequestId.make(id),
  method: "ping" as const,
});

const initReq = (id: string) => ({
  jsonrpc: "2.0" as const,
  id: RequestId.make(id),
  method: "initialize" as const,
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: config,
  },
});

const listToolsReq = (id: string) => ({
  jsonrpc: "2.0" as const,
  id: RequestId.make(id),
  method: "tools/list" as const,
});

const callToolReq = (id: string, message: string) => ({
  jsonrpc: "2.0" as const,
  id: RequestId.make(id),
  method: "tools/call" as const,
  params: { name: "Echo", arguments: { message } },
});

const callToolCountReq = (id: string, n: number) => ({
  jsonrpc: "2.0" as const,
  id: RequestId.make(id),
  method: "tools/call" as const,
  params: { name: "Count", arguments: { n } },
});

const listPromptsReq = (id: string) => ({
  jsonrpc: "2.0" as const,
  id: RequestId.make(id),
  method: "prompts/list" as const,
});

describe("Server.handleRequest (single)", () => {
  bench("ping", async () => {
    await Effect.runPromise(
      withServer((mcp) => mcp.handleRequest(pingReq("1")))
    );
  });

  bench("initialize", async () => {
    await Effect.runPromise(
      withServer((mcp) => mcp.handleRequest(initReq("2")))
    );
  });

  bench("listTools", async () => {
    await Effect.runPromise(
      withServer((mcp) => mcp.handleRequest(listToolsReq("3")))
    );
  });

  bench("callTool (Echo)", async () => {
    await Effect.runPromise(
      withServer((mcp) => mcp.handleRequest(callToolReq("4", "hi")))
    );
  });

  bench("callTool (Count)", async () => {
    await Effect.runPromise(
      withServer((mcp) => mcp.handleRequest(callToolCountReq("5", 100)))
    );
  });

  bench("listPrompts", async () => {
    await Effect.runPromise(
      withServer((mcp) => mcp.handleRequest(listPromptsReq("6")))
    );
  });
});

describe("Server.handleRequest (sequential, 100 requests)", () => {
  bench("100 pings", async () => {
    await Effect.runPromise(
      withServer((mcp) =>
        Effect.gen(function* () {
          for (let i = 0; i < 100; i++) {
            yield* mcp.handleRequest(pingReq(String(i)));
          }
        })
      )
    );
  });

  bench("100 listTools", async () => {
    await Effect.runPromise(
      withServer((mcp) =>
        Effect.gen(function* () {
          for (let i = 0; i < 100; i++) {
            yield* mcp.handleRequest(listToolsReq(String(i)));
          }
        })
      )
    );
  });

  bench("100 callTool (Echo)", async () => {
    await Effect.runPromise(
      withServer((mcp) =>
        Effect.gen(function* () {
          for (let i = 0; i < 100; i++) {
            yield* mcp.handleRequest(callToolReq(String(i), String(i)));
          }
        })
      )
    );
  });

  bench("100 callTool (Count)", async () => {
    await Effect.runPromise(
      withServer((mcp) =>
        Effect.gen(function* () {
          for (let i = 0; i < 100; i++) {
            yield* mcp.handleRequest(callToolCountReq(String(i), 50));
          }
        })
      )
    );
  });
});

describe("Server.handleRequest (concurrent, 100 forks)", () => {
  bench("100 concurrent pings", async () => {
    await Effect.runPromise(
      withServer((mcp) =>
        Effect.forEach(
          Array.from({ length: 100 }, (_, i) =>
            mcp.handleRequest(pingReq(String(i)))
          ),
          (req) => Effect.fork(req),
          { concurrency: "unbounded" }
        ).pipe(Effect.flatMap(Fiber.joinAll))
      )
    );
  });

  bench("100 concurrent callTool (Echo)", async () => {
    await Effect.runPromise(
      withServer((mcp) =>
        Effect.forEach(
          Array.from({ length: 100 }, (_, i) =>
            mcp.handleRequest(callToolReq(String(i), String(i)))
          ),
          (req) => Effect.fork(req),
          { concurrency: "unbounded" }
        ).pipe(Effect.flatMap(Fiber.joinAll))
      )
    );
  });
});
