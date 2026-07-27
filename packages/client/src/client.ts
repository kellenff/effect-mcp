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

export type McpClientOpts = {
  timeout?: Duration.Duration;
};

const _notImplemented = (...args: any[]) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Not implemented`, args);
  });

export namespace McpClient {
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

export class McpClient extends Context.Tag("McpClient")<
  McpClient,
  McpClient.Service
>() {}

export const make = (config: Implementation, opts?: McpClientOpts) =>
  Effect.gen(function* () {
    const transport = yield* Transport;
    const server = yield* Ref.make<InitializeResult | null>(null);
    const deferredRequests = yield* DeferredMap;

    /**
     *
     * Internal methods
     *
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

    const _handlePing = Effect.fn("HandlePing")(function* (
      id: RequestId,
      message: PingRequest
    ) {
      const response = EmptyResult.make({
        id,
      });

      yield* transport.sendResult(id, response);
    });

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
     * Await a response from the server
     *
     * @param id - The request id
     * @param schema - The schema to decode the response
     * @returns The decoded response
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
     * Initialize the client
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
     * Get a completion from the server
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
     * Await a completion from the server
     */
    const completeAwait = Effect.fn("CompleteAwait")(function* (
      params: CompleteRequest["params"]
    ) {
      const id = yield* complete(params);
      return yield* _awaitResponse(id, CompleteResult);
    });

    /**
     * Get a prompt from the server
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
     * Await a prompt from the server
     */
    const getPromptAwait = Effect.fn("GetPromptAwait")(function* (
      params: GetPromptRequest["params"]
    ) {
      const id = yield* getPrompt(params);
      return yield* _awaitResponse(id, GetPromptResult);
    });

    /**
     * List prompts from the server
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

    const listPromptsAwait = Effect.fn("ListPromptsAwait")(function* (
      params: ListPromptsRequest["params"]
    ) {
      const id = yield* listPrompts(params);
      return yield* _awaitResponse(id, ListPromptsResult);
    });

    /**
     * Read a resource from the server
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
     * Await a resource from the server
     */
    const readResourceAwait = Effect.fn("ReadResourceAwait")(function* (
      params: ReadResourceRequest["params"]
    ) {
      const id = yield* readResource(params);
      return yield* _awaitResponse(id, ReadResourceResult);
    });

    /**
     * List resources from the server
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
     * Await a list of resources from the server
     */
    const listResourcesAwait = Effect.fn("ListResourcesAwait")(function* (
      params: ListResourcesRequest["params"]
    ) {
      const id = yield* listResources(params);
      return yield* _awaitResponse(id, ListResourcesResult);
    });

    /**
     * List resource templates from the server
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
     * Await a list of resource templates from the server
     */
    const listResourceTemplatesAwait = Effect.fn("ListResourceTemplatesAwait")(
      function* (params: ListResourceTemplatesRequest["params"]) {
        const id = yield* listResourceTemplates(params);
        return yield* _awaitResponse(id, ListResourceTemplatesResult);
      }
    );

    /**
     * Call a tool from the server
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
     * Await a tool call from the server
     */
    const callToolAwait = Effect.fn("CallToolAwait")(function* (
      params: CallToolRequest["params"]
    ) {
      const id = yield* callTool(params);
      return yield* _awaitResponse(id, CallToolResult);
    });

    /**
     * List tools from the server
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
     * Await a list of tools from the server
     */
    const listToolsAwait = Effect.fn("ListToolsAwait")(function* (
      params: ListToolsRequest["params"]
    ) {
      const id = yield* listTools(params);
      return yield* _awaitResponse(id, ListToolsResult);
    });

    /**
     * Subscribe to a resource from the server
     */
    const subscribe = Effect.fn("Subscribe")(function* (
      params: SubscribeRequest["params"]
    ) {
      // TODO: Implement
      // Optionally yield a subscription service
      // If not service, return an error
      // Check if server supports subscriptions, if not return an error
      // If subscriptions service and server supports subscriptions, send event
    });

    /**
     * Unsubscribe from a resource from the server
     */
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
     * Ping the server
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
     * Await a ping from the server
     */
    const pingAwait = Effect.fn("PingAwait")(function* () {
      const id = yield* ping();
      return yield* _awaitResponse(id, EmptyResult);
    });

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

export const layer = (config: Implementation, opts?: McpClientOpts) =>
  Layer.effect(McpClient, make(config, opts));
