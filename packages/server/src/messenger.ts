import {
  JsonRpcError,
  JSONRPCMessage,
  Notification,
  Request,
  RequestId,
  Result,
} from "@effect-mcp/shared";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";

/**
 * Service for publishing outbound JSON-RPC messages through a bounded
 * PubSub channel.
 *
 * Provides operations for sending JSON-RPC responses (results and errors),
 * notifications, and requests to subscribed consumers. Each outbound message
 * is logged and published to the internal bounded PubSub with a capacity of
 * 100 entries, allowing multiple subscribers to observe outgoing traffic.
 */
export class Messenger extends Effect.Service<Messenger>()(
  "@effect-mcp/server/Messenger",
  {
    /**
     * Creates a JSON-RPC messaging effect that manages outbound message transmission.
     *
     * Sets up a bounded publish-subscribe channel for outgoing JSON-RPC messages
     * and provides generator functions for dispatching the four JSON-RPC message
     * types: results, errors, notifications, and requests. All send operations
     * publish to the outbound channel and log the payload before transmission.
     *
     * @returns An effect yielding an object containing the outbound channel and
     *   the send functions.
     */
    effect: Effect.gen(function* () {
      const outbound = yield* PubSub.bounded<JSONRPCMessage>(100);

      const sendResult = Effect.fn("SendResult")(function* (
        id: RequestId,
        result: Result
      ) {
        yield* Effect.log(`Sending result:`, result);
        yield* PubSub.publish(outbound, {
          jsonrpc: "2.0",
          id: id,
          result: result,
        });
      });

      /**
       * Represents an effectful function that sends a JSON-RPC error response.
       * Takes a request identifier and error object, logs the error, and publishes
       * the error response to the outbound message channel.
       *
       * @param id - The request identifier to correlate the error response
       * @param error - The JSON-RPC error object containing error details
       * @returns An effect that logs the error and publishes it to the outbound channel
       */
      const sendError = Effect.fn("SendError")(function* (
        id: RequestId,
        error: JsonRpcError
      ) {
        yield* Effect.log(`Sending error:`, error);
        yield* PubSub.publish(outbound, {
          jsonrpc: "2.0",
          id: id,
          error: error,
        });
      });

      /**
       * Represents an effectful function that sends a notification by logging it and publishing it to a PubSub channel.
       * The notification is transformed into a JSON-RPC 2.0 format before being published.
       *
       * @param notification - The notification object to be sent, containing method and parameters.
       * @returns An Effect that logs the notification and publishes it to the outbound PubSub channel.
       */
      const sendNotification = Effect.fn("SendNotification")(function* (
        notification: Notification
      ) {
        yield* Effect.log(`Sending notification:`, notification);
        yield* PubSub.publish(outbound, {
          jsonrpc: "2.0",
          method: notification.method,
          params: notification.params,
        });
      });

      /**
       * An effectful function that handles sending RPC requests.
       * Takes a request object and performs logging before publishing
       * the request to an outbound PubSub channel in JSON-RPC 2.0 format.
       *
       * @param request - The request object containing method and params
       * @returns An effect that logs the request and publishes it to the outbound channel
       */
      const sendRequest = Effect.fn("SendRequest")(function* (
        request: Request
      ) {
        yield* Effect.log(`Sending request:`, request);
        yield* PubSub.publish(outbound, {
          jsonrpc: "2.0",
          method: request.method,
          params: request.params,
        });
      });

      return {
        outbound,
        sendResult,
        sendError,
        sendNotification,
        sendRequest,
      };
    }),
  }
) {}
