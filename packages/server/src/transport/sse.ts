// SSE Api Route

import { JSONRPCMessage, handleMessage } from "@effect-mcp/shared";
import * as HttpHeaders from "@effect/platform/Headers";
import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { randomUUID } from "node:crypto";
import { TextEncoder } from "node:util";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Messenger } from "../messenger.js";

/**
 * Creates a Server-Sent Events (SSE) HTTP route that streams JSON-RPC messages
 * to connected clients. Each connection receives a unique session identifier
 * and is subscribed to the outbound message pub/sub channel.
 *
 * @param msgEndpoint - The base URL or endpoint identifier that clients
 *                      should use to send follow-up messages back to the
 *                      server for the established session.
 * @returns An HTTP route definition for the "GET /sse" path that responds
 *          with a streaming `text/event-stream` containing JSON-RPC message
 *          events and an initial endpoint event announcing the session id.
 */
export const SSERoute = (msgEndpoint: string) =>
  HttpRouter.makeRoute(
    "GET",
    "/sse",
    Effect.gen(function* () {
      const sessionId = randomUUID();
      const messenger = yield* Messenger;
      yield* Effect.log(`New SSE session: ${sessionId}`);
      // TODO: Filter by sessionId or make new stream per session
      const outboundStream = Stream.fromPubSub(messenger.outbound).pipe(
        Stream.flatMap((message) => Schema.encode(JSONRPCMessage)(message)),
        Stream.map(
          (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`
        )
      );

      const endpointMsg = Stream.succeed(
        `event: endpoint\ndata: ${msgEndpoint}?sessionId=${sessionId}\n\n`
      );

      const encoder = new TextEncoder();

      /**
       * A composed stream that processes messages through a pipeline.
       * The stream merges endpoint messages with outbound messages,
       * logs each message to the effect system, and encodes messages
       * using a text encoder.
       *
       * @typedef {Stream} messageStream
       */
      const stream = pipe(
        endpointMsg,
        Stream.merge(outboundStream),
        Stream.tap((msg) => Effect.log(`Stream message: ${msg}`)),
        Stream.map((msg) => encoder.encode(msg))
      );

      /**
       * @type {HttpHeaders}
       * @readonly
       * @description HTTP headers configured for Server-Sent Events (SSE) streaming responses.
       * The headers include:
       * - content-type: text/event-stream - Specifies the response as Server-Sent Events format
       * - cache-control: no-cache - Prevents caching of the stream response
       * - x-accel-buffering: no - Disables proxy buffering for nginx and similar proxies
       * - connection: keep-alive - Maintains persistent HTTP connection (applied conditionally for HTTP/1.x)
       */
      const headers = HttpHeaders.fromInput({
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
        connection: "keep-alive", // if (req.httpVersion !== "2.0")
      });

      // TODO: Store session id in cache

      return HttpServerResponse.stream(stream, {
        contentType: "text/event-stream",
        headers,
      });
    })
  );

// Post Message Route

/**
 * Represents a route handler for processing incoming messages via HTTP POST request.
 * This route accepts JSON-RPC formatted messages at the "/messages" endpoint,
 * logs the received message, processes it asynchronously, and returns a 202 Accepted response.
 * The message processing is performed in the background without blocking the response.
 */
export const MessageRoute = () =>
  HttpRouter.makeRoute(
    "POST",
    "/messages",
    Effect.gen(function* () {
      // TODO: Check for session id

      const message = yield* HttpServerRequest.schemaBodyJson(JSONRPCMessage);

      yield* Effect.log(`Received message:`, message);

      yield* handleMessage(message).pipe(Effect.forkDaemon);

      return yield* HttpServerResponse.text("Accepted", { status: 202 });
    })
  );
