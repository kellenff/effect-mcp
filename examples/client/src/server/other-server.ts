import {
  McpServer,
  Prompt,
  PromptKit,
  StdioServerTransport,
} from "@effect-mcp/server";
import { AiToolkit } from "@effect/ai";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";

/**
 * Tools
 */

class Calculator extends Schema.TaggedRequest<Calculator>()(
  "Calculator",
  {
    success: Schema.String,
    failure: Schema.String,
    payload: {
      expression: Schema.String,
    },
  },
  { description: "Evaluate a mathematical expression" }
) {}

const toolkit = AiToolkit.empty.add(Calculator);

const ToolkitLive = toolkit.implement((handlers) =>
  handlers.handle("Calculator", (params) => {
    try {
      // Simple eval for demonstration purposes
      const result = eval(params.expression);
      return Effect.succeed(`Result: ${result}`);
    } catch (error) {
      return Effect.succeed(`Error: Invalid expression`);
    }
  })
);

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

export const ServerLive = McpServer.layer({
  name: "WeatherCalculator",
  version: "0.0.1",
}).pipe(
  Layer.provide(ToolkitLive),
  Layer.provide(PromptkitLive),
  Layer.provide(Layer.scope)
);

const AppLive = Layer.provideMerge(ServerLive, NodeContext.layer).pipe(
  Layer.provideMerge(Layer.scope)
);
StdioServerTransport.make.pipe(Effect.provide(AppLive), NodeRuntime.runMain);
