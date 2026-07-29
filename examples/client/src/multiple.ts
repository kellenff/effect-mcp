import { McpClient, StdioClientTransport } from "@effect-mcp/client";
import { Command } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Logger, LogLevel } from "effect";
import { clientCwd, serverCwd } from "./shared.js";

const server1Cmd = Command.make("node", "./dist/modelcontextprotocol.js").pipe(
  Command.workingDirectory(serverCwd)
);

const server2Cmd = Command.make("node", "./dist/server/other-server.js").pipe(
  Command.workingDirectory(clientCwd)
);

const servers = {
  echo: server1Cmd,
  calculator: server2Cmd,
};

/**
 * An effect that initializes multiple MCP clients, retrieves their available tools and prompts,
 * and logs the results. For each server configuration, it creates a client, initializes it,
 * fetches the list of tools and prompts, then combines all results into a single object
 * which is logged as debug output.
 */
const program = Effect.gen(function* () {
  const results = yield* Effect.forEach(
    Object.entries(servers),
    ([name, cmd]) =>
      Effect.gen(function* () {
        const client = yield* McpClient.make({
          name: name,
          version: "1.0.0",
        }).pipe(Effect.provide(StdioClientTransport.layer(cmd)));

        yield* client.initialize;

        const tools = yield* client.listToolsAwait({});
        const prompts = yield* client.listPromptsAwait({});

        return [name, { tools, prompts }] as const;
      })
  );

  return Object.fromEntries(results);
}).pipe(Effect.flatMap((results) => Effect.logDebug(JSON.stringify(results))));

program.pipe(
  Effect.provide(NodeContext.layer),
  Logger.withMinimumLogLevel(LogLevel.Debug),
  Effect.scoped,
  NodeRuntime.runMain
);
