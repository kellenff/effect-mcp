import { McpClient, StdioClientTransport } from "@effect-mcp/client";
import { Command } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Logger, LogLevel } from "effect";
import { serverCwd } from "./shared.js";

const command = Command.make("node", "./dist/stdio.js").pipe(
  Command.workingDirectory(serverCwd)
);

const client = McpClient.layer({
  name: "Echo",
  version: "1.0.0",
});

const transport = StdioClientTransport.layer(command);

const program = Effect.gen(function* () {
  const client = yield* McpClient.McpClient;

  yield* client.initialize;

  const tools = yield* client.listToolsAwait({});
  const prompts = yield* client.listPromptsAwait({});

  return {
    prompts,
    tools,
  };
}).pipe(Effect.flatMap((result) => Effect.logDebug(JSON.stringify(result))));

program.pipe(
  Effect.provide(client),
  Effect.provide(transport),
  Effect.provide(NodeContext.layer),
  Logger.withMinimumLogLevel(LogLevel.Debug),
  Effect.scoped,
  NodeRuntime.runMain
);
