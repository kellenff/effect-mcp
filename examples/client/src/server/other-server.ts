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
 * Calculator tool for evaluating mathematical expressions.
 *
 * Accepts a string containing a mathematical expression and returns the result of evaluating that expression.
 */
const Calculator = Tool.make("Calculator", {
  description: "Evaluate a mathematical expression",
  parameters: {
    expression: Schema.String,
  },
  success: Schema.String,
});

/**
 * Represents a toolkit instance created from the Calculator class.
 * This toolkit provides access to calculator functionality and operations.
 * The toolkit is instantiated using the Toolkit.make() factory method
 * with Calculator as the source class for generating the toolkit interface.
 */
const toolkit = Toolkit.make(Calculator);

/**
 * ToolkitLive
 *
 * A live implementation of the toolkit layer that provides concrete functionality
 * for toolkit operations. This variable contains the runtime implementation
 * that can be used to execute toolkit services in a live environment.
 *
 * The implementation includes a Calculator service that evaluates mathematical
 * expressions and returns the result or an error message if the expression
 * is invalid. The calculator uses JavaScript's eval function for evaluation
 * and handles both successful computations and errors gracefully.
 *
 * This live implementation can be used in place of mock or test implementations
 * when actual toolkit functionality is required during application execution.
 */
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
 * A finalized PromptKit instance aggregating two effect-based prompts:
 * a calculator prompt for evaluating mathematical expressions and
 * a weather prompt that returns a forecast string for a requested
 * location, optionally including humidity information.
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
 * ServerLive represents a configured server layer for the WeatherCalculator service.
 * This layer integrates core toolkit dependencies and provides a scoped execution environment.
 * The server is built using McpServer with version 0.0.1 and includes necessary
 * infrastructure layers for toolkit functionality, prompt handling, and scoped operations.
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

/**
 * A layered application runtime environment that combines server lifecycle management with Node.js context provisioning.
 * This layer merges the server live layer with Node.js context capabilities and includes scope management.
 * It provides the necessary infrastructure for running applications with proper resource lifecycle handling.
 */
const AppLive = Layer.provideMerge(ServerLive, NodeContext.layer).pipe(
  Layer.provideMerge(Layer.scope)
);
StdioServerTransport.make.pipe(Effect.provide(AppLive), NodeRuntime.runMain);
