import {
  McpServer,
  Prompt,
  PromptKit,
  StdioServerTransport,
} from "@effect-mcp/server";
import { Tool, Toolkit } from "@effect/ai";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";

/**
 * Tools
 */

const Calculator = Tool.make("Calculator", {
  description: "Evaluate a mathematical expression",
  parameters: {
    expression: Schema.String,
  },
  success: Schema.String,
});

const toolkit = Toolkit.make(Calculator);

const ToolkitLive = toolkit.toLayer({
  Calculator: ({ expression }) => {
    try {
      // Simple eval for demonstration purposes
      const result = eval(expression);
      return Effect.succeed(`Result: ${result}`);
    } catch (error) {
      return Effect.succeed(`Error: Invalid expression`);
    }
  },
});

/**
 * Prompts
 */

const PromptkitLive = PromptKit.empty
  .add(
    Prompt.effect(
      {
        name: "Calculate",
        description: "Evaluate a mathematical expression",
        arguments: {
          expression: Schema.String,
        },
      },
      (params) =>
        Effect.succeed([
          {
            role: "user",
            content: {
              type: "text",
              text: `Calculate: ${params.expression}`,
            },
          },
        ])
    )
  )
  .add(
    Prompt.effect(
      {
        name: "Weather",
        description: "Get a weather forecast for a location",
        arguments: {
          location: Schema.String,
          includeHumidity: Schema.String.pipe(Schema.optional),
        },
      },
      (params) =>
        Effect.gen(function* () {
          const humidity =
            params.includeHumidity === "true" ? `The humidity is 65%` : "";
          return [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `The weather in ${params.location} is currently sunny and 72°F. ${humidity} Have a wonderful day!`,
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
    name: "WeatherCalculator",
    version: "0.0.1",
  },
  toolkit
).pipe(
  Layer.provide(ToolkitLive),
  Layer.provide(PromptkitLive),
  Layer.provide(Layer.scope)
);

const AppLive = Layer.provideMerge(ServerLive, NodeContext.layer).pipe(
  Layer.provideMerge(Layer.scope)
);
StdioServerTransport.make.pipe(Effect.provide(AppLive), NodeRuntime.runMain);
