import { handleMessage, JSONRPCMessage } from "@effect-mcp/shared";
import * as Terminal from "@effect/platform/Terminal";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as LogLevel from "effect/LogLevel";
import * as Queue from "effect/Queue";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { Messenger } from "../messenger.js";

/**
 * Represents a server transport mechanism that uses standard input/output streams for communication.
 * This transport handles message passing through stdin and stdout, making it suitable for
 * command-line interfaces and process-to-process communication scenarios.
 * The transport is implemented as a context tag to enable dependency injection patterns.
 */
export class StdioServerTransport extends Context.Tag(
  "@effect-mcp/server/StdioServerTransport"
)<StdioServerTransport, void>() {}

export const make = Effect.gen(function* () {
  const messenger = yield* Messenger;
  const terminal = yield* Terminal.Terminal;

  const outbound = yield* messenger.outbound.subscribe;

  // Start listening for messages to send via stdout
  yield* Effect.gen(function* () {
    const response = yield* Queue.take(outbound);
    yield* Effect.log(`Sending message:`, response);

    /**
     * Represents the encoded result of a JSONRPCMessage response.
     * This variable holds the output from the Schema.encode operation
     * applied to a JSONRPCMessage schema with the provided response data.
     * The encoding process transforms the response object into a format
     * compliant with the JSONRPCMessage schema structure.
     *
     * @type {Generator<EncodeError, JSONRPCMessage, any>}
     */
    const encoded = yield* Schema.encode(JSONRPCMessage)(response);

    /**
     * Write the framed JSON payload to stdout and re-arm the
     * pump.
     *
     * `terminal.display` is the platform-port's stdout write
     * (UTF-8 bytes via the `Terminal` service). The trailing
     * `\n` is mandatory — the stdio MCP wire format is
     * newline-delimited JSON, and the inbound half below uses
     * `terminal.readLine` to split frames.
     *
     * `Effect.repeat(Schedule.forever)` re-runs the generator on
     * the next outbound message once the current one has been
     * written. Because the `Queue.take(outbound)` at the top
     * suspends until a value is available, the loop naturally
     * idles when the outbound mailbox is empty (no busy-wait,
     * no fixed-interval polling).
     *
     * `Effect.fork` detaches the pump from the main fiber so it
     * runs concurrently with the inbound half and the rest of
     * the server. The forked fiber's lifetime is tied to the
     * parent scope — when `StdioServerTransport.make`'s scope
     * exits, the forked pump is interrupted and
     * `terminal.display` will not be called again.
     */
    yield* terminal.display(JSON.stringify(encoded) + "\n");
  }).pipe(Effect.repeat(Schedule.forever), Effect.fork);

  // Start listening for messages via stdin
  yield* Effect.gen(function* () {
    const input = yield* terminal.readLine;

    yield* Effect.log(`Received message: ${input}`);

    if (input) {
      const parsed = yield* Schema.decodeUnknown(JSONRPCMessage)(
        JSON.parse(input)
      );

      yield* handleMessage(parsed).pipe(Effect.fork);
    }
  }).pipe(
    Effect.catchTag("ParseError", (err) =>
      Effect.logError(`Error parsing message: ${err.message}`)
    ),
    Effect.repeat(Schedule.forever)
  );
}).pipe(
  // Hiding all logs so they don't interfere with the stdio stream
  // Currently can't figure out how to remove default logger from an effect. Only on the top level program.
  Logger.withMinimumLogLevel(LogLevel.None)
);

/**
 * Represents a layer that wraps the StdioServerTransport with effectful operations.
 * This layer provides a structured way to interact with standard input/output
 * transport mechanisms within an effectful context.
 *
 * The layer is constructed using the make function which configures and initializes
 * the transport with the necessary dependencies and settings.
 *
 * @typedef {Layer} layer
 * @property {StdioServerTransport} transport - The underlying transport mechanism
 * @property {Function} make - Factory function used to create and configure the layer
 */
export const layer = Layer.effect(StdioServerTransport, make);
