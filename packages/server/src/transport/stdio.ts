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

    const encoded = yield* Schema.encode(JSONRPCMessage)(response);

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

export const layer = Layer.effect(StdioServerTransport, make);
