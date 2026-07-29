import {
  CallToolRequest,
  CallToolResult,
  CancelledNotification,
  CompleteRequest,
  CompleteResult,
  EmptyResult,
  GetPromptRequest,
  GetPromptResult,
  Implementation,
  InitializedNotification,
  InitializeRequest,
  InitializeResult,
  JSONRPCError,
  JsonRpcError,
  JsonRpcErrorCode,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ListToolsRequest,
  ListToolsResult,
  PingRequest,
  ReadResourceRequest,
  ReadResourceResult,
  RequestId,
  ServerNotification,
  ServerRequest,
  ServerResult,
  SubscribeRequest,
  UnsubscribeRequest,
} from "@effect-mcp/shared";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Mailbox from "effect/Mailbox";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { randomUUID } from "node:crypto";
import { DeferredMap } from "./transport/deferred.js";
import { Transport } from "./transport/transport.js";
const generateId = () => RequestId.make(randomUUID());

/**
 * Configuration options for MCP client instances.
 *
 * This type defines the optional settings that can be provided when creating
 * or configuring an MCP client. It allows customization of client behavior
 * through various parameters.
 *
 * @property timeout - Optional duration specifying the maximum time to wait
 *                    for operations to complete before timing out. When not
 *                    specified, the client will use its default timeout value.
 */
export type McpClientOpts = {
  timeout?: Duration.Duration;
};

const _notImplemented = (...args: any[]) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Not implemented`, args);
  });

/**
 * Namespace containing the contract for an MCP (Model Context Protocol) client service.
 */
export namespace McpClient {
  /**
   * Defines the contract for an MCP (Model Context Protocol) service that handles
   * JSON-RPC requests and responses. Each operation is provided in two variants:
   * a request-initiating variant that returns a RequestId for tracking the
   * asynchronous request, and an awaiting variant that resolves with the full
   * result once the response is received.
   *
   * The awaiting variants may fail with a JsonRpcError, while the initiating
   * variants are typically non-failing effects that simply dispatch the request.
   */
  export interface Service {
    initialize: Effect.Effect<InitializeResult, JsonRpcError>;
    complete: (params: CompleteRequest["params"]) => Effect.Effect<RequestId>;
    completeAwait: (
      params: CompleteRequest["params"]
    ) => Effect.Effect<CompleteResult, JsonRpcError>;
    getPrompt: (params: GetPromptRequest["params"]) => Effect.Effect<RequestId>;
    getPromptAwait: (
      params: GetPromptRequest["params"]
    ) => Effect.Effect<GetPromptResult, JsonRpcError>;
    listPrompts: (
      params: ListPromptsRequest["params"]
    ) => Effect.Effect<RequestId>;
    listPromptsAwait: (
      params: ListPromptsRequest["params"]
    ) => Effect.Effect<ListPromptsResult, JsonRpcError>;
    readResource: (
      params: ReadResourceRequest["params"]
    ) => Effect.Effect<RequestId>;
    readResourceAwait: (
      params: ReadResourceRequest["params"]
    ) => Effect.Effect<ReadResourceResult, JsonRpcError>;
    listResources: (
      params: ListResourcesRequest["params"]
    ) => Effect.Effect<RequestId>;
    listResourcesAwait: (
      params: ListResourcesRequest["params"]
    ) => Effect.Effect<ListResourcesResult, JsonRpcError>;
    listResourceTemplates: (
      params: ListResourceTemplatesRequest["params"]
    ) => Effect.Effect<RequestId>;
    listResourceTemplatesAwait: (
      params: ListResourceTemplatesRequest["params"]
    ) => Effect.Effect<ListResourceTemplatesResult, JsonRpcError>;
    callTool: (params: CallToolRequest["params"]) => Effect.Effect<RequestId>;
    callToolAwait: (
      params: CallToolRequest["params"]
    ) => Effect.Effect<CallToolResult, JsonRpcError>;
    listTools: (params: ListToolsRequest["params"]) => Effect.Effect<RequestId>;
    listToolsAwait: (
      params: ListToolsRequest["params"]
    ) => Effect.Effect<ListToolsResult, JsonRpcError>;
    ping: () => Effect.Effect<RequestId>;
    pingAwait: () => Effect.Effect<EmptyResult, JsonRpcError>;
  }
}

/**
 * Represents a client for interacting with an MCP (Management Control Point) service.
 * This class extends Context.Tag to provide a tagged service client implementation.
 * The client is configured with a service interface that defines the available operations.
 */
export class McpClient extends Context.Tag("McpClient")<
  McpClient,
  McpClient.Service
>() {}

/**
 * Creates an MCP client effect that manages JSON-RPC communication over a transport layer.
 *
 * Sets up message routing infrastructure including deferred request tracking, server initialization
 * state, and handlers for JSON-RPC responses, errors, requests, and notifications. Spawns a
 * background fiber to consume incoming messages from the transport mailbox, decoding each message
 * and dispatching it to the appropriate handler based on its shape (error, response, request, or notification).
 *
 * @param config - The implementation configuration providing request handlers and client capabilities.
 * @param opts - Optional MCP client options for customizing client behavior.
 * @returns An Effect that yields the MCP client interface.
 */
export const make = (config: Implementation, opts?: McpClientOpts) =>
  Effect.gen(function* () {
    const transport = yield* Transport;
    const server = yield* Ref.make<InitializeResult | null>(null);
    const deferredRequests = yield* DeferredMap;

    /**
     * HandleResponse effect that processes JSON-RPC response messages.
     * Decodes the response result using ServerResult schema and fulfills the corresponding deferred request.
     * If decoding fails, sends a JSON-RPC error response through the transport layer.
     * Looks up the deferred request by message ID and succeeds it with the decoded response.
     * Catches JSON-RPC errors and sends them back through the transport.
     */
    const handleResponse = Effect.fn("HandleResponse")(function* (
      message: JSONRPCResponse
    ) {
      return yield* Effect.gen(function* () {
        const response = yield* Schema.decode(ServerResult)(
          message.result
        ).pipe(
          Effect.mapError((e) =>
            JsonRpcError.fromCode("ParseError", e.message, e.cause)
          )
        );

        const deferred = yield* deferredRequests.pipe(
          Ref.get,
          Effect.map((map) => HashMap.get(map, message.id))
        );

        if (Option.isSome(deferred)) {
          yield* Deferred.succeed(deferred.value, response);
        }
      }).pipe(
        Effect.catchTag("JsonRpcError", (err) =>
          transport.sendError(message.id, err)
        )
      );
    });

    /**
     * Represents an effect that handles JSON-RPC error responses by resolving associated deferred requests with the error.
     *
     * This function retrieves the deferred request associated with the error's ID from the deferredRequests store.
     * If a deferred request exists for the given ID, it fails the deferred with a JsonRpcError containing the error details.
     *
     * @param message - The JSON-RPC error message containing the error details and request ID
     * @returns An effect that processes the error and resolves the corresponding deferred request
     */
    const handleError = Effect.fn("HandleError")(function* (
      message: JSONRPCError
    ) {
      const deferred = yield* deferredRequests.pipe(
        Ref.get,
        Effect.map((map) => HashMap.get(map, message.id))
      );

      if (Option.isSome(deferred)) {
        yield* Deferred.fail(deferred.value, new JsonRpcError(message.error));
      }
    });

    /**
     * HandleNotification is an effectful function that processes incoming JSON-RPC notifications.
     * It decodes the notification message using the ServerNotification schema and handles
     * any parsing errors by logging them appropriately.
     *
     * @param message - The JSON-RPC notification message to handle
     * @returns An effect that processes the notification or logs an error if decoding fails
     */
    const handleNotification = Effect.fn("HandleNotification")(function* (
      message: JSONRPCNotification
    ) {
      return yield* Effect.gen(function* () {
        const notification = yield* Schema.decodeUnknown(ServerNotification)(
          message
        );
        // yield* notifications.notify(notification);
      }).pipe(
        Effect.catchTag("ParseError", (err) =>
          Effect.logError(
            `Error handling notification: ${err.message}`,
            message
          )
        )
      );
    });

    /**
     * Handles incoming ping requests by creating and sending an empty response.
     * This function processes ping messages received from the transport layer
     * and responds with an empty result payload to acknowledge receipt.
     *
     * @param id - The unique identifier for the request message
     * @param message - The ping request payload containing message data
     * @returns An effect that sends an empty response back through the transport
     */
    const _handlePing = Effect.fn("HandlePing")(function* (
      id: RequestId,
      message: PingRequest
    ) {
      const response = EmptyResult.make({
        id,
      });

      yield* transport.sendResult(id, response);
    });

    /**
     * Represents an effectful function that handles incoming JSON-RPC requests.
     * This function processes raw JSON-RPC request messages by decoding them into structured requests,
     * then routes them to appropriate handlers based on the method name.
     * It includes error handling for parsing failures and logs errors during request processing.
     * Specific methods like "ping" are handled directly while others may be marked as not implemented.
     * Any JSON-RPC errors encountered during processing are caught and sent back through the transport.
     *
     * @param rawMessage - The incoming JSON-RPC request message to be processed
     * @returns An effect that resolves to the result of request processing
     */
    const handleRequest = Effect.fn("HandleRequest")(function* (
      rawMessage: JSONRPCRequest
    ) {
      return yield* Effect.gen(function* () {
        const request = yield* Schema.decodeUnknown(ServerRequest)({
          method: rawMessage.method,
          params: rawMessage.params,
        }).pipe(
          Effect.mapError((error) =>
            JsonRpcError.fromCode("ParseError", error.message, error.cause)
          )
        );

        yield* Match.value(request).pipe(
          Match.when({ method: "ping" }, (msg) =>
            _handlePing(rawMessage.id, msg)
          ),
          Match.when({ method: "roots/list" }, _notImplemented),
          Match.when({ method: "sampling/createMessage" }, _notImplemented),
          Match.exhaustive
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError(`Error handling request: ${err.message}`)
        ),
        Effect.catchTag("JsonRpcError", (err) =>
          transport.sendError(rawMessage.id, err)
        )
      );
    });

    /**
     * Handles incoming JSON-RPC messages by routing them to appropriate handlers based on message type.
     *
     * This function processes JSON-RPC messages and delegates them to specific handlers:
     * - Messages with an "error" field are handled as JSON-RPC errors
     * - Messages with a "result" field are handled as JSON-RPC responses
     * - Messages with an "id" field are handled as JSON-RPC requests
     * - All other messages are treated as notifications
     *
     * @param message - The JSON-RPC message to process
     * @returns The result of the appropriate message handler
     */
    const handleMessage = Effect.fn("HandleMessage")(function* (
      message: JSONRPCMessage
    ) {
      yield* Match.value(message).pipe(
        Match.when(
          (message): message is JSONRPCError =>
            "error" in message && typeof message.error === "object",
          (msg) => handleError(msg)
        ),
        Match.when(
          (message): message is JSONRPCResponse =>
            "result" in message && typeof message.result === "object",
          (msg) => handleResponse(msg)
        ),
        Match.when(
          (message): message is JSONRPCRequest => "id" in message,
          (msg) => handleRequest(msg)
        ),
        Match.orElse((msg) => handleNotification(msg))
      );
    });

    // Listen for incoming messages
    yield* Mailbox.toStream(transport.inbound).pipe(
      Stream.mapEffect(Schema.decodeUnknown(JSONRPCMessage)),
      Stream.catchTag("ParseError", (err) =>
        Effect.logError(`Error handling message: ${err.message}`)
      ),
      Stream.filter((msg) => msg !== void 0),
      Stream.tap((msg) => Effect.logDebug(`Handling message:`, msg)),
      Stream.runForEach(handleMessage),
      Effect.fork
    );

    /**
     * Awaits a JSON-RPC response for a given request id, validating it against
     * a schema, with a configurable timeout and cancellation handling.
     *
     * The function registers a deferred under the given request id in a shared
     * map of pending requests, then awaits its completion. Once the deferred
     * resolves, the raw response is decoded using the provided schema; any
     * decoding error is converted into a JSON-RPC `ParseError`.
     *
     * The whole operation is bounded by `opts.timeout` (defaulting to
     * `"15 seconds"`). If the timeout elapses before the deferred resolves,
     * a JSON-RPC `RequestTimeout` error is produced and the pending entry is
     * removed from the deferred map. For timeout failures specifically, a
     * `"notifications/cancelled"` notification is dispatched to the transport,
     * indicating that the request associated with `id` has been cancelled.
     *
     * @type {<A extends ServerResult>(
     *   id: RequestId,
     *   schema: Schema.Schema<A>
     * ) => Effect.Effect<A, JsonRpcError, never>}
     */
    const _awaitResponse = <A extends ServerResult>(
      id: RequestId,
      schema: Schema.Schema<A>
    ) =>
      Effect.gen(function* () {
        const deferred = yield* Deferred.make<A, JsonRpcError>();
        yield* Ref.update(deferredRequests, (map) =>
          HashMap.set(
            map,
            id,
            deferred as unknown as Deferred.Deferred<ServerResult, JsonRpcError>
          )
        );
        const response = yield* Deferred.await(deferred);
        return yield* Schema.decode(schema)(response).pipe(
          Effect.mapError((e) =>
            JsonRpcError.fromCode("ParseError", e.message, e.cause)
          )
        );
      }).pipe(
        Effect.timeoutFail({
          duration: opts?.timeout ?? "15 seconds",
          onTimeout: () =>
            JsonRpcError.fromCode("RequestTimeout", `Request ${id} timed out`),
        }),
        Effect.tapError((error) =>
          Effect.gen(function* () {
            yield* Ref.update(deferredRequests, (map) =>
              HashMap.remove(map, id)
            );
            if (error.code === JsonRpcErrorCode.RequestTimeout) {
              yield* transport.sendNotification(
                CancelledNotification.make({
                  method: "notifications/cancelled",
                  params: {
                    requestId: id,
                    reason: `Request ${id} timed out`,
                  },
                })
              );
            }
          })
        )
      );

    /**
     *
     * Client -> Server Request methods
     *
     */

    /**
     * Effect generator function that initializes the server connection.
     * Generates a unique ID, creates and sends an initialize request with protocol version and client info,
     * waits for the server response, stores the result, and sends an initialized notification.
     * Returns the initialization result from the server.
     */
    const initialize = Effect.gen(function* () {
      const id = generateId();

      const request = InitializeRequest.make({
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          // TODO: Add capabilities
          capabilities: {
            // sampling: {},
            // roots: {},
          },
          clientInfo: config,
        },
      });

      yield* transport.sendRequest(id, request);
      const result = yield* _awaitResponse(id, InitializeResult);
      // TODO: Check server matches supported protocol version
      yield* Ref.set(server, result);

      const initialized = InitializedNotification.make({
        method: "notifications/initialized",
        params: {},
      });

      yield* transport.sendNotification(initialized);

      return result;
    });

    /**
     * Represents an effect that sends a completion request through a transport layer.
     *
     * This effect generates a unique identifier and constructs a completion request
     * with the provided parameters. It then sends this request through the transport
     * mechanism and returns the generated identifier for tracking purposes.
     *
     * @typedef {Function} CompleteEffect
     * @param {CompleteRequest["params"]} params - The parameters for the completion request
     * @returns {Generator} A generator that yields the transport request and returns the request ID
     */
    const complete = Effect.fn("Complete")(function* (
      params: CompleteRequest["params"]
    ) {
      const id = generateId();

      const request = CompleteRequest.make({
        method: "completion/complete",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * Creates an effect that completes a request with the given parameters and awaits the response.
     * The effect first invokes the complete function with the provided parameters to obtain a request identifier,
     * then awaits the response for that request using the CompleteResult schema.
     *
     * @param params - The parameters required to complete the request
     * @returns An effect that yields the response data once available
     */
    const completeAwait = Effect.fn("CompleteAwait")(function* (
      params: CompleteRequest["params"]
    ) {
      const id = yield* complete(params);
      return yield* _awaitResponse(id, CompleteResult);
    });

    /**
     * Creates a new prompt request and sends it through the transport layer.
     * Generates a unique identifier for the request and returns it for tracking purposes.
     * The request is constructed with the "prompts/get" method and the provided parameters.
     *
     * @param params - The parameters for the prompt request
     * @returns A unique identifier for the sent request
     */
    const getPrompt = Effect.fn("GetPrompt")(function* (
      params: GetPromptRequest["params"]
    ) {
      const id = generateId();

      const request = GetPromptRequest.make({
        method: "prompts/get",
        params,
      });

      yield* transport.sendRequest(id, request);

      return id;
    });

    /**
     * Creates an effect that sends a prompt request and waits for the response.
     * This function combines the prompt sending and response awaiting operations
     * into a single effect that handles the complete prompt-response cycle.
     *
     * @param params - The parameters for the prompt request
     * @returns An effect that yields the prompt response when available
     */
    const getPromptAwait = Effect.fn("GetPromptAwait")(function* (
      params: GetPromptRequest["params"]
    ) {
      const id = yield* getPrompt(params);
      return yield* _awaitResponse(id, GetPromptResult);
    });

    /**
     * Represents an effectful function that lists prompts by sending a request to the transport layer.
     * Takes parameters for listing prompts and returns a generated request identifier.
     *
     * @param params - The parameters for the list prompts request
     * @returns An effect that yields the generated request identifier
     */
    const listPrompts = Effect.fn("ListPrompts")(function* (
      params: ListPromptsRequest["params"]
    ) {
      // Check if server supports prompts
      const id = generateId();

      // Should we parse this here?
      const request = ListPromptsRequest.make({
        method: "prompts/list",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * An effect that lists prompts and awaits the response.
     *
     * This function creates an effect that first initiates a prompt listing operation
     * and then waits for the response to be available. It combines the listing
     * and awaiting logic into a single effect.
     *
     * @param {ListPromptsRequest["params"]} params - The parameters for listing prompts
     * @returns {Effect<ListPromptsResult>} An effect that yields the list prompts result
     */
    const listPromptsAwait = Effect.fn("ListPromptsAwait")(function* (
      params: ListPromptsRequest["params"]
    ) {
      const id = yield* listPrompts(params);
      return yield* _awaitResponse(id, ListPromptsResult);
    });

    /**
     * Represents an effect that reads a resource from the server.
     * This effect generates a unique identifier and sends a resource read request
     * through the transport layer. The effect returns the generated identifier
     * which can be used to track the request.
     *
     * @param params - The parameters required for reading the resource, typed according to ReadResourceRequest parameters
     * @returns A unique identifier for the read request
     */
    const readResource = Effect.fn("ReadResource")(function* (
      params: ReadResourceRequest["params"]
    ) {
      // Check if server supports resource reading
      const id = generateId();

      const request = ReadResourceRequest.make({
        method: "resources/read",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * An effect that reads a resource and awaits its response.
     *
     * This function combines the resource reading operation with a subsequent
     * await operation to handle the resource's response. It first reads the
     * resource using the provided parameters and then waits for the response
     * to be processed.
     *
     * @typedef {Function} ReadResourceAwait
     * @param {ReadResourceRequest["params"]} params - The parameters required to read the resource.
     * @returns {Effect<never, Error, ReadResourceResult>} An effect that yields the read resource result.
     */
    const readResourceAwait = Effect.fn("ReadResourceAwait")(function* (
      params: ReadResourceRequest["params"]
    ) {
      const id = yield* readResource(params);
      return yield* _awaitResponse(id, ReadResourceResult);
    });

    /**
     * Represents an effectful function that lists resources by sending a request through the transport layer.
     * Takes parameters matching the ListResourcesRequest parameters and returns a generated request identifier.
     *
     * @typedef {Function} listResources
     * @param {ListResourcesRequest["params"]} params - The parameters for the list resources request
     * @returns {Effect<string>} An effect that yields a string identifier for the sent request
     */
    const listResources = Effect.fn("ListResources")(function* (
      params: ListResourcesRequest["params"]
    ) {
      // Check if server supports resources
      const id = generateId();

      const request = ListResourcesRequest.make({
        method: "resources/list",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * An effect that lists resources and awaits the response.
     *
     * This function creates an effect that first initiates a resource listing operation
     * and then awaits the completion of that operation to return the results.
     *
     * @param params - The parameters for the list resources request
     * @returns An effect that yields the list resources result when completed
     */
    const listResourcesAwait = Effect.fn("ListResourcesAwait")(function* (
      params: ListResourcesRequest["params"]
    ) {
      const id = yield* listResources(params);
      return yield* _awaitResponse(id, ListResourcesResult);
    });

    /**
     * Effect function that lists resource templates by sending a request to the server.
     * Generates a unique identifier for the request and sends a ListResourceTemplatesRequest
     * with the specified parameters. Returns the generated request identifier.
     *
     * @param params - Parameters for listing resource templates
     * @returns The unique identifier of the sent request
     */
    const listResourceTemplates = Effect.fn("ListResourceTemplates")(function* (
      params: ListResourceTemplatesRequest["params"]
    ) {
      // Check if server supports resource templates
      const id = generateId();

      const request = ListResourceTemplatesRequest.make({
        method: "resources/templates/list",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * An effect that lists resource templates and awaits the response.
     *
     * This function creates an effect that first initiates a request to list resource templates
     * using the provided parameters, then waits for and returns the completed response.
     *
     * @param params - The parameters for listing resource templates
     * @returns The result of listing resource templates
     */
    const listResourceTemplatesAwait = Effect.fn("ListResourceTemplatesAwait")(
      function* (params: ListResourceTemplatesRequest["params"]) {
        const id = yield* listResourceTemplates(params);
        return yield* _awaitResponse(id, ListResourceTemplatesResult);
      }
    );

    /**
     * Represents an effectful function that calls a tool with the specified parameters.
     * This function generates a unique identifier for the tool call request and sends
     * the request through the transport layer. It returns the generated identifier
     * which can be used to track the tool call response.
     *
     * @param params - The parameters required for the tool call request
     * @returns A unique identifier for the tool call request
     */
    const callTool = Effect.fn("CallTool")(function* (
      params: CallToolRequest["params"]
    ) {
      // Check if server supports tool calls
      const id = generateId();

      const request = CallToolRequest.make({
        method: "tools/call",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * An effect that calls a tool and awaits its response.
     *
     * This function creates an effect that first invokes a tool with the provided parameters
     * and then waits for the tool's response before completing. It combines the tool calling
     * operation with a response awaiting operation in a single effect.
     *
     * @param params - The parameters to pass to the tool being called
     * @returns The result of the tool call after awaiting its response
     */
    const callToolAwait = Effect.fn("CallToolAwait")(function* (
      params: CallToolRequest["params"]
    ) {
      const id = yield* callTool(params);
      return yield* _awaitResponse(id, CallToolResult);
    });

    /**
     * Represents a function that lists available tools from the server.
     * This effect generator sends a request to retrieve tool information
     * and returns a unique identifier for tracking the request.
     *
     * @param params - The parameters for the list tools request
     * @returns A unique identifier for the request
     */
    const listTools = Effect.fn("ListTools")(function* (
      params: ListToolsRequest["params"]
    ) {
      // Check if server supports tool calls
      const id = generateId();

      const request = ListToolsRequest.make({
        method: "tools/list",
        params,
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * Represents an effect that asynchronously lists tools and awaits the response.
     * This effect combines the initiation of a tool listing operation with waiting for its completion.
     * The operation is performed asynchronously, first initiating the list operation and then awaiting the response.
     *
     * @template T - The type of the tool list request parameters
     * @param params - The parameters for the list tools request
     * @returns An effect that yields the list tools result when completed
     */
    const listToolsAwait = Effect.fn("ListToolsAwait")(function* (
      params: ListToolsRequest["params"]
    ) {
      const id = yield* listTools(params);
      return yield* _awaitResponse(id, ListToolsResult);
    });

    const subscribe = Effect.fn("Subscribe")(function* (
      params: SubscribeRequest["params"]
    ) {
      // TODO: Implement
      // Optionally yield a subscription service
      // If not service, return an error
      // Check if server supports subscriptions, if not return an error
      // If subscriptions service and server supports subscriptions, send event
    });

    const unsubscribe = Effect.fn("Unsubscribe")(function* (
      params: UnsubscribeRequest["params"]
    ) {
      // TODO: Implement
      // Optionally yield a subscription service
      // If not service, return an error
      // Check if server supports subscriptions, if not return an error
      // If subscriptions service and server supports subscriptions, send event
    });

    /**
     * Represents an effect that sends a ping request and returns the generated request identifier.
     * This effect generates a unique ID, creates a ping request with method "ping",
     * sends the request through the transport layer, and returns the generated ID.
     * @type {Effect<never, never, string>}
     */
    const ping = Effect.fn("Ping")(function* () {
      const id = generateId();

      const request = PingRequest.make({
        method: "ping",
      });

      yield* transport.sendRequest(id, request);
      return id;
    });

    /**
     * Represents an effect that sends a ping request and awaits the response.
     * This effect combines the ping operation with a response waiting mechanism,
     * yielding the result once the response is received.
     * @type {Effect<never, never, EmptyResult>}
     */
    const pingAwait = Effect.fn("PingAwait")(function* () {
      const id = yield* ping();
      return yield* _awaitResponse(id, EmptyResult);
    });

    /**
     * Register a finalizer that closes the underlying transport
     * when the client's scope exits — for any reason (success,
     * failure, interruption, or cancellation).
     *
     * `transport.close` is transport-specific:
     *   - **stdio** — terminates the child process and flushes its
     *     stdio buffers.
     *   - **SSE**   — aborts the SSE response stream and unwinds the
     *     request handler.
     *
     * Without this finalizer the client would still terminate its
     * transport correctly (the runtime eventually reaps everything),
     * but the explicit teardown is what produces clean shutdown
     * logs / metrics and prevents the outbound forked fibers from
     * trying to write to a closed pipe.
     */
    yield* Effect.addFinalizer(() => transport.close);

    return {
      initialize,
      complete,
      completeAwait,
      getPrompt,
      getPromptAwait,
      listPrompts,
      listPromptsAwait,
      readResource,
      readResourceAwait,
      listResources,
      listResourcesAwait,
      listResourceTemplates,
      listResourceTemplatesAwait,
      //   subscribe,
      //   unsubscribe,
      callTool,
      callToolAwait,
      listTools,
      listToolsAwait,
      ping,
      pingAwait,
    } satisfies McpClient.Service;
  }).pipe(Effect.provide(DeferredMap.Empty));

/**
 * Creates a layer for the MCP client implementation.
 *
 * This function constructs a layer that provides the MCP client service
 * by combining the provided configuration and options. The layer uses
 * the effect system to manage the client lifecycle and dependencies.
 *
 * @param config - The implementation configuration for the MCP client
 * @param opts - Optional client configuration parameters
 * @returns A layer that provides the MCP client service
 */
export const layer = (config: Implementation, opts?: McpClientOpts) =>
  Layer.effect(McpClient, make(config, opts));
