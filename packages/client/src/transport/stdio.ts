import { JsonRpcError, JSONRPCMessage } from "@effect-mcp/shared";
import * as Command from "@effect/platform/Command";
import { TextDecoder } from "node:util";
import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Mailbox from "effect/Mailbox";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Messenger } from "../messenger.js";
import { Transport } from "./transport.js";

/**
 * Decodes a JSON-RPC message from an unknown input value.
 * Attempts to parse and validate the input against the JSONRPCMessage schema.
 * If parsing fails, wraps the error in a JsonRpcError with ParseError code.
 *
 * @param msg - The input value to decode, expected to be a JSON-RPC message structure
 * @returns An Effect that either succeeds with the decoded JSONRPCMessage or fails with a JsonRpcError
 */
const decode = (msg: any) =>
  Schema.decodeUnknown(JSONRPCMessage)(msg).pipe(
    Effect.mapError((e) =>
      JsonRpcError.fromCode("ParseError", "Failed to parse message", e)
    )
  );

/**
 * Encodes a JSON-RPC message according to the defined schema.
 * Takes a JSON-RPC message object and serializes it into the proper format.
 * If encoding fails due to schema validation errors, wraps the error in a JsonRpcError
 * with ParseError code and descriptive message.
 *
 * @param msg - The JSON-RPC message to encode
 * @returns An Effect that resolves to the encoded message or rejects with a JsonRpcError
 */
const encode = (msg: JSONRPCMessage) =>
  Schema.encode(JSONRPCMessage)(msg).pipe(
    Effect.mapError((e) =>
      JsonRpcError.fromCode("ParseError", "Failed to encode message", e)
    )
  );

/**
 * Creates a transport layer that bridges an Effect-based messaging system
 * with an external child process. The function spawns a process using the
 * provided command, wires its stdin to outbound JSON-RPC messages, and
 * parses its stdout into inbound messages delivered to the returned mailbox.
 *
 * @param {Command.Command} command - The child process command to launch.
 * @returns {Effect} An effect that yields a Transport.Service containing
 *   an inbound mailbox, a close effect for terminating the process, and
 *   send helpers for requests, notifications, results, and errors.
 */
export const make = (command: Command.Command) =>
  Effect.gen(function* () {
    const messenger = yield* Messenger;
    const inbound = yield* Mailbox.make<JSONRPCMessage>();

    /**
     * A stream that processes outbound messages from a messenger mailbox.
     * The stream encodes messages, logs them, converts them to JSON strings,
     * encodes them as text, and filters out undefined values.
     * Any encoding errors are caught and logged.
     */
    const stdin = Mailbox.toStream(messenger.outbound).pipe(
      Stream.mapEffect(encode),
      Stream.tap((response) => Effect.log(`Sending message:`, response)),
      Stream.map((response) => JSON.stringify(response) + "\n"),
      Stream.encodeText,
      Stream.catchAll((e) => Effect.log(`Error encoding message:`, e)),
      Stream.filter((msg) => msg !== void 0)
    );

    /**
     * Executes a command process with specified input/output handling.
     * The process inherits stderr output and uses provided stdin data.
     * Command execution is started and the resulting process is yielded.
     * @type {Process}
     */
    const process = yield* command.pipe(
      Command.stdin(stdin),
      Command.stderr("inherit"),
      Command.start
    );

    const decoder = new TextDecoder();

    // // Start listening for messages via stdout
    yield* process.stdout
      .pipe(
        Stream.mapChunks(Chunk.map((bytes) => decoder.decode(bytes))),
        Stream.splitLines,
        Stream.tap((msg) => Effect.log(`Received message:`, msg)),
        Stream.mapEffect((msg) =>
          Effect.try({
            try: () => JSON.parse(msg),
            catch: (e) =>
              JsonRpcError.fromCode("ParseError", "Failed to parse message", e),
          })
        ),
        Stream.mapEffect(decode),
        Stream.runForEach((msg) => inbound.offer(msg))
      )
      .pipe(Effect.fork);

    /**
     * Represents an effect that terminates the current process with SIGINT signal.
     * The effect handles any errors that occur during process termination by logging them.
     * This is typically used to gracefully shut down a running process.
     */
    const close = process
      .kill("SIGINT")
      .pipe(
        Effect.catchAll((e) => Effect.logError(`Error closing process:`, e))
      );

    return {
      inbound,
      close,
      sendRequest: messenger.sendRequest,
      sendNotification: messenger.sendNotification,
      sendResult: messenger.sendResult,
      sendError: messenger.sendError,
    } satisfies Transport.Service;
  }).pipe(Effect.provide(Messenger.Default));

/**
 * Creates a layer that provides a Transport service initialized with the given command.
 * The layer is constructed by applying the command to the make function and wrapping
 * the result in a Layer.effect with Transport as the tag.
 *
 * @param command - The command to initialize the Transport service with
 * @returns A layer that provides a Transport service
 */
export const layer = (command: Command.Command) =>
  Layer.effect(Transport, make(command));
