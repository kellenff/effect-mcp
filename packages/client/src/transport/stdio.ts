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

const decode = (msg: any) =>
  Schema.decodeUnknown(JSONRPCMessage)(msg).pipe(
    Effect.mapError((e) =>
      JsonRpcError.fromCode("ParseError", "Failed to parse message", e)
    )
  );

const encode = (msg: JSONRPCMessage) =>
  Schema.encode(JSONRPCMessage)(msg).pipe(
    Effect.mapError((e) =>
      JsonRpcError.fromCode("ParseError", "Failed to encode message", e)
    )
  );

export const make = (command: Command.Command) =>
  Effect.gen(function* () {
    const messenger = yield* Messenger;
    const inbound = yield* Mailbox.make<JSONRPCMessage>();

    const stdin = Mailbox.toStream(messenger.outbound).pipe(
      Stream.mapEffect(encode),
      Stream.tap((response) => Effect.log(`Sending message:`, response)),
      Stream.map((response) => JSON.stringify(response) + "\n"),
      Stream.encodeText,
      Stream.catchAll((e) => Effect.log(`Error encoding message:`, e)),
      Stream.filter((msg) => msg !== void 0)
    );

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

export const layer = (command: Command.Command) =>
  Layer.effect(Transport, make(command));
