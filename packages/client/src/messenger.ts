import {
  JsonRpcError,
  JSONRPCMessage,
  Notification,
  Request,
  RequestId,
  Result,
} from "@effect-mcp/shared";
import * as Mailbox from "effect/Mailbox";
import * as Effect from "effect/Effect";

/**
 * Service that exposes JSON-RPC 2.0 messaging capabilities for an MCP server.
 *
 * Wraps an outbound message queue and provides effectful helpers for emitting
 * the four JSON-RPC 2.0 message shapes: results, errors, notifications, and
 * requests. Each helper constructs the appropriate envelope, logs the outgoing
 * payload, and enqueues it onto the outbound channel for transport.
 */
export class Messenger extends Effect.Service<Messenger>()(
  "@effect-mcp/server/Messenger",
  {
    /**
     * Creates an outbound messaging service for JSON-RPC 2.0 communication.
     *
     * Sets up a mailbox for outgoing JSON-RPC messages and provides functions
     * to dispatch results, errors, notifications, and requests to remote peers.
     * All sent messages are logged before being offered to the outbound mailbox
     * for asynchronous delivery.
     */
    effect: Effect.gen(function* () {
      const outbound = yield* Mailbox.make<JSONRPCMessage>();

      /**
       * Creates an Effect that sends a JSON-RPC result response for a given request ID.
       * This function logs the result being sent and offers it to the outbound message queue.
       * The response follows the JSON-RPC 2.0 specification with the provided request ID and result data.
       *
       * @param id - The request ID to associate with this response
       * @param result - The result data to send in the response
       * @returns An Effect that performs the send operation
       */
      const sendResult = Effect.fn("SendResult")(function* (
        id: RequestId,
        result: Result
      ) {
        yield* Effect.log(`Sending result:`, result);
        yield* outbound.offer({
          jsonrpc: "2.0",
          id: id,
          result: result,
        });
      });

      /**
       * Sends a JSON-RPC error response for a given request ID.
       *
       * This function creates an Effect that logs the error and sends it to the outbound queue
       * formatted as a JSON-RPC 2.0 error response. The error is associated with the provided
       * request ID to maintain proper correlation between requests and error responses.
       *
       * @param id - The request identifier to associate with the error response
       * @param error - The JSON-RPC error object containing error details
       * @returns An Effect that sends the error response to the outbound queue
       */
      const sendError = Effect.fn("SendError")(function* (
        id: RequestId,
        error: JsonRpcError
      ) {
        yield* Effect.log(`Sending error:`, error);
        yield* outbound.offer({
          jsonrpc: "2.0",
          id: id,
          error: error,
        });
      });

      /**
       * An effectful function that sends a notification by logging it and offering it to an outbound queue.
       * Takes a notification object and yields a JSON-RPC 2.0 compliant message to the outbound queue.
       * @param notification - The notification to send
       */
      const sendNotification = Effect.fn("SendNotification")(function* (
        notification: Notification
      ) {
        yield* Effect.log(`Sending notification:`, notification);
        yield* outbound.offer({
          jsonrpc: "2.0",
          method: notification.method,
          params: notification.params,
        });
      });

      /**
       * An effectful function that sends a request by logging it and offering it to an outbound queue.
       * Takes a request identifier and request object, logs the request details, and formats the request
       * according to JSON-RPC 2.0 specification before adding it to the outbound message queue.
       *
       * @param {RequestId} id - The unique identifier for the request
       * @param {Request} request - The request object containing method and parameters
       * @returns {Effect<never, never, void>} An effect that logs the request and queues it for outbound transmission
       */
      const sendRequest = Effect.fn("SendRequest")(function* (
        id: RequestId,
        request: Request
      ) {
        yield* Effect.log(`Sending request:`, request);
        yield* outbound.offer({
          jsonrpc: "2.0",
          id: id,
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
