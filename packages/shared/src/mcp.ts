import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
import type {
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from "./schema.js";

/**
 * Namespace containing interfaces and types for JSON-RPC message handling.
 * Provides a structured way to process different types of JSON-RPC communications
 * through a service interface that handles errors, responses, notifications, and requests.
 */
export namespace MCP {
  /**
   * Represents a service that handles JSON-RPC 2.0 messaging operations.
   * Provides handler functions for managing errors, responses, notifications, and requests
   * in a JSON-RPC communication flow, with all operations returning Effect instances
   * to support composable side effects and asynchronous processing.
   */
  export interface Service {
    /**
     * A function that handles JSON-RPC error messages by performing side effects.
     * Takes a JSONRPCError object as input and returns an Effect that resolves to void.
     * This function is responsible for processing and managing error states in the application.
     */
    handleError: (message: JSONRPCError) => Effect.Effect<void>;
    /**
     * A function that processes a JSON-RPC response message.
     *
     * This handler takes a JSON-RPC response and performs the necessary actions
     * to process the response data. It returns an Effect that resolves to void
     * upon successful processing.
     *
     * @param message - The JSON-RPC response message to handle
     * @returns An Effect that performs the response handling and resolves to void
     */
    handleResponse: (message: JSONRPCResponse) => Effect.Effect<void>;
    /**
     * Handles incoming JSON-RPC notification messages by processing them without expecting a response.
     * This function processes notifications according to the JSON-RPC 2.0 specification where notifications
     * are one-way messages that do not require a response from the receiver.
     * The handler performs side effects as needed to process the notification but returns no result value.
     *
     * @param message - The JSON-RPC notification object containing method name and parameters
     * @returns An Effect that performs the notification handling side effects and resolves to void
     */
    handleNotification: (message: JSONRPCNotification) => Effect.Effect<void>;
    /**
     * Represents a function that processes incoming JSON-RPC requests.
     * Takes a JSONRPCRequest object as input and returns an Effect that performs the request handling.
     * The Effect may fail with an error if the request cannot be processed successfully.
     * The function is responsible for interpreting the request, executing the appropriate logic,
     * and managing any side effects or asynchronous operations required to fulfill the request.
     */
    handleRequest: (message: JSONRPCRequest) => Effect.Effect<void>;
  }
}

/**
 * `Context.Tag` identifier for the MCP service.
 *
 * Resolve via `yield* MCP` (or `Effect.flatMap(MCP, ...)`) to obtain
 * the `MCP.Service` value. See `handleMessage` below for the typical
 * inbound dispatch pattern.
 *
 * @category Service
 */
export class MCP extends Context.Tag("MCP")<MCP, MCP.Service>() {}

/**
 * Dispatch a `JSONRPCMessage` to the appropriate `MCP.Service` method.
 *
 * Pattern-matches on the *shape* of the message (not its `method`
 * payload), using field-presence as the discriminator:
 *   - `error` field present → `MCP.handleError`
 *   - `result` field present → `MCP.handleResponse`
 *   - `id` field present (and neither result nor error) → `MCP.handleRequest`
 *   - otherwise (id absent) → `MCP.handleNotification` (the `orElse`
 *     fallback — notifications are the only message kind without an id)
 *
 * This is the inbound side of the JSON-RPC envelope — every inbound
 * frame goes through `handleMessage` regardless of which transport
 * produced it (stdio or SSE), so the rest of the client/server logic
 * can stay transport-agnostic.
 *
 * @param message The JSON-RPC envelope. Discriminator inferred from
 *                field presence; the type guard narrows the union.
 * @returns An `Effect` that resolves to the matching `MCP.Service`
 *          handler's result. Failures from the handlers propagate
 *          unchanged (e.g. a `handleError` that itself fails will
 *          fail this outer effect).
 */
export const handleMessage = (message: JSONRPCMessage) =>
  pipe(
    MCP,
    Effect.flatMap((mcp) =>
      Match.value(message).pipe(
        Match.when(
          (message): message is JSONRPCError =>
            "error" in message && typeof message.error === "object",
          (msg) => mcp.handleError(msg)
        ),
        Match.when(
          (message): message is JSONRPCResponse =>
            "result" in message && typeof message.result === "object",
          (msg) => mcp.handleResponse(msg)
        ),
        Match.when(
          (message): message is JSONRPCRequest => "id" in message,
          (msg) => mcp.handleRequest(msg)
        ),

        Match.orElse((msg) => mcp.handleNotification(msg))
      )
    )
  );
