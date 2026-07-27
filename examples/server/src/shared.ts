import { McpServer, Prompt, PromptKit } from "@effect-mcp/server";
import { Tool, Toolkit } from "@effect/ai";
import { Effect, Layer, Schema } from "effect";

/**
 * Tools
 */

const Echo = Tool.make("Echo", {
  description: "Echo a message",
  parameters: {
    message: Schema.String,
  },
  success: Schema.String,
});

const toolkit = Toolkit.make(Echo);

const ToolkitLive = toolkit.toLayer({
  Echo: ({ message }) => Effect.succeed(`Echo: ${message}`),
});

/**
 * Prompts
 */

const PromptkitLive = PromptKit.empty
  .add(
    Prompt.effect(
      {
        name: "Echo",
        description: "Echo a message",
        arguments: {
          message: Schema.String,
        },
      },
      (params) =>
        Effect.succeed([
          {
            role: "user",
            content: {
              type: "text",
              text: `Echo: ${params.message}`,
            },
          },
        ])
    )
  )
  .add(
    Prompt.effect(
      {
        name: "Greet",
        description: "Greet someone with a friendly message",
        arguments: {
          name: Schema.String,
          includeTime: Schema.String.pipe(Schema.optional),
        },
      },
      (params) =>
        Effect.gen(function* () {
          const time = params.includeTime === "true"
            ? `The time is ${new Date().toLocaleTimeString()}`
            : "";
          return [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Hello ${params.name}! ${time} Hope you're having a great day!`,
              },
            },
          ];
        })
    )
  )
  .finalize();
/**
 * Server
 */

export const ServerLive = McpServer.layer(
  {
    name: "Echo",
    version: "0.0.1",
  },
  toolkit
).pipe(
  Layer.provide(ToolkitLive),
  Layer.provide(PromptkitLive),
  Layer.provide(Layer.scope)
);
