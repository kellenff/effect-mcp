import {
  CallToolRequest,
  CallToolResult,
  ClientNotification,
  ClientRequest,
  ClientResult,
  CompleteRequest,
  GetPromptRequest,
  GetPromptResult,
  JsonRpcError,
  JSONRPCError,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourceTemplatesRequest,
  ListRootsResult,
  ListToolsRequest,
  ListToolsResult,
  MCP,
  Prompt,
  PromptMessage,
  ReadResourceRequest,
  SetLevelRequest,
  SubscribeRequest,
  Tool,
  UnsubscribeRequest,
  type CreateMessageResult,
  type Implementation,
  type InitializeRequest,
  type InitializeResult,
  type PingRequest,
  type RequestId,
} from "@effect-mcp/shared";
import * as AiTool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";

type ToolkitType<Tools extends Record<string, AiTool.Any>> = Toolkit.Toolkit<Tools>;
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as JsonSchema from "effect/JSONSchema";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as AST from "effect/SchemaAST";
import * as Scope from "effect/Scope";
import { Messenger } from "./messenger.js";
import * as PromptKit from "./prompts/prompt-kit.js";

/**
 * Builds an MCP service layer by wiring the supplied server
 * configuration and tool kit to a set of JSON-RPC request handlers.
 *
 * The returned effect resolves to an `MCP.MCP.Service` and requires
 * `Scope.Scope`, `Messenger`, and `AiTool.HandlersFor<Tools>` in its
 * environment. Internally it composes handlers for the protocol-level
 * requests (`ping`, `initialize`, `completion/complete`,
 * `logging/setLevel`) as well as the feature surfaces
 * (`prompts/list`, `prompts/get`, `tools/list`). Prompt handling is
 * sourced from an optional `PromptKit.Registry` service, while tool
 * listing is sourced from the provided `toolkit`. Handlers for
 * `completion/complete` and `logging/setLevel` are intentionally left
 * as unimplemented stubs.
 */
export const make = <Tools extends Record<string, AiTool.Any>>(
  config: Implementation,
  toolkit: ToolkitType<Tools> = Toolkit.empty as unknown as ToolkitType<Tools>
): Effect.Effect<
  MCP.MCP.Service,
  never,
  Scope.Scope | Messenger | AiTool.HandlersFor<Tools>
> =>
  Effect.gen(function* () {
    const messenger = yield* Messenger;
    const promptkit = yield* Effect.serviceOption(PromptKit.Registry);
    const tk = yield* toolkit;

    const _notImplemented = (...args: any[]) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`Not implemented`, args);
      });

    const _handlePing = Effect.fn("HandlePing")(function* (
      id: RequestId,
      message: PingRequest
    ) {
      yield* messenger.sendResult(id, {
        _meta: {
          pong: true,
        },
      });
    });

    /**
     * Effect handler for processing client initialization requests.
     * This effect handles the initial handshake between client and server,
     * logging the client information and responding with server capabilities.
     *
     * @param id - The request identifier used to correlate the response
     * @param message - The initialization request containing client information
     * @returns An effect that sends the initialization response with server capabilities
     */
    const _handleInitialize = Effect.fn("HandleInitialize")(function* (
      id: RequestId,
      message: InitializeRequest
    ) {
      yield* Effect.log(`Initializing server with client info:`, message);

      const response: InitializeResult = {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
          resourceTemplates: {},
        },
        serverInfo: config,
      };

      yield* messenger.sendResult(id, response);
    });

    const _handleComplete = Effect.fn("HandleComplete")(function* (
      id: RequestId,
      message: CompleteRequest
    ) {
      // TODO: Implement
    });

    const _handleSetLevel = Effect.fn("HandleSetLevel")(function* (
      id: RequestId,
      message: SetLevelRequest
    ) {
      // TODO: Implement
    });

    /**
     * JSON-RPC handler for the `prompts/get` method.
     *
     * Resolves a prompt template by name, validates and decodes the inbound
     * arguments against the prompt's declared schema, invokes the prompt's
     * handler, then re-encodes the resulting `PromptMessage[]` for the wire.
     * Errors are reported via `messenger.sendError` with appropriate JSON-RPC
     * error codes: `InvalidParams` for missing prompts or absent prompt kit,
     * `ParseError` for schema validation failures, and `InternalError` for
     * handler failures.
     *
     * @param id - The JSON-RPC request identifier used to correlate the response.
     * @param message - The incoming `prompts/get` request, including the prompt
     *                  name and its argument payload.
     * @returns An `Effect` that produces no value on success; the response is
     *          delivered through the messenger rather than returned.
     */
    const _handleGetPrompt = Effect.fn("HandleGetPrompt")(function* (
      id: RequestId,
      message: GetPromptRequest
    ) {
      if (Option.isNone(promptkit)) {
        return yield* messenger.sendError(
          id,
          JsonRpcError.fromCode("InvalidParams", "No prompts available")
        );
      }

      const prompt = HashMap.get(promptkit.value, message.params.name);
      if (Option.isNone(prompt)) {
        return yield* messenger.sendError(
          id,
          JsonRpcError.fromCode("InvalidParams", "Prompt not found")
        );
      }

      /**
       * Decodes and validates the arguments provided in the prompt value using a structured schema.
       * This variable holds the result of decoding the unknown input arguments against
       * a defined schema structure. The decoding process ensures that the arguments conform
       * to the expected format and types as specified in the schema.
       */
      const decodeArgs = Schema.decodeUnknown(
        Schema.Struct(prompt.value.arguments)
      );
      const encodeSuccess = Schema.encode(Schema.Array(PromptMessage));

      /**
       * Decodes incoming message arguments, processes them through a prompt handler,
       * and encodes the resulting messages as a JSON-RPC success response.
       *
       * The process involves three main steps:
       * 1. Decoding the raw arguments from the message parameters
       * 2. Applying the prompt handler to transform the decoded arguments
       * 3. Encoding the handler result into a proper success response format
       *
       * Any decoding or encoding errors are mapped to appropriate JSON-RPC error responses.
       * Handler execution errors are wrapped as internal server errors.
       *
       * @typedef {Effect.Effect<PromptMessage[], JsonRpcError>} args
       * @returns {Effect.Effect<PromptMessage[], JsonRpcError>} An effect that resolves
       * to an array of prompt messages or fails with a JSON-RPC error
       */
      const args = yield* decodeArgs(message.params.arguments).pipe(
        Effect.mapError((err) =>
          JsonRpcError.fromCode("ParseError", err.message, err.issue)
        ),
        Effect.flatMap(prompt.value.handler),
        Effect.mapError((err) =>
          JsonRpcError.fromCode("InternalError", "Error calling prompt", err)
        ),
        Effect.flatMap((messages) =>
          encodeSuccess(messages).pipe(
            Effect.mapError((err) =>
              JsonRpcError.fromCode("ParseError", err.message, err.issue)
            )
          )
        )
      ) as Effect.Effect<PromptMessage[], JsonRpcError>;

      const result: GetPromptResult = {
        messages: args,
      };

      yield* messenger.sendResult(id, result);
    });

    /**
     * Handles the listing of available prompts by processing a ListPromptsRequest.
     * Retrieves prompt information including name, description, and argument details.
     * Sends the collected prompt data as a ListPromptsResult through the messenger.
     * @param id - The request identifier for tracking the response
     * @param message - The ListPromptsRequest containing the request details
     * @returns An effect that sends the list of available prompts as a result
     */
    const _handleListPrompts = Effect.fn("HandleListPrompts")(function* (
      id: RequestId,
      message: ListPromptsRequest
    ) {
      const prompts: Prompt[] = [];

      if (Option.isNone(promptkit)) {
        const data: ListPromptsResult = {
          prompts,
        };
        return yield* messenger.sendResult(id, data);
      }

      for (const prompt of HashMap.values(promptkit.value)) {
        const ast = Schema.Struct(prompt.arguments).ast;
        const propertySigs = AST.getPropertySignatures(ast);
        const args = propertySigs.map((prop) => ({
          name: prop.name.toString(),
          description: (prop.annotations.description ?? "") as string,
          required: !prop.isOptional,
        }));

        prompts.push({
          name: prompt.name,
          description: prompt.description,
          arguments: args,
        });
      }

      const data: ListPromptsResult = {
        prompts,
      };
      return yield* messenger.sendResult(id, data);
    });

    /**
     * Effect handler function for processing list tools requests.
     * Iterates through all available tools in the toolkit, extracts their metadata including name, description, and input schema,
     * and returns a formatted list of tools as a result.
     * @param id - The request identifier used for messaging
     * @param message - The list tools request message containing tool query parameters
     * @returns An effect that sends the list of available tools as a result
     */
    const _handleListTools = Effect.fn("HandleListTools")(function* (
      id: RequestId,
      message: ListToolsRequest
    ) {
      const tools: Tool[] = [];

      for (const tool of Object.values(tk.tools)) {
        tools.push({
          name: tool.name,
          description: tool.description ?? "",
          inputSchema: makeJsonSchema(tool.parametersSchema.ast) as any,
        });
      }

      const data: ListToolsResult = {
        tools,
      };
      return yield* messenger.sendResult(id, data);
    });

    /**
     * Effect function that handles tool call requests by executing the specified tool
     * with provided arguments and returning the result.
     *
     * This function looks up the requested tool by name, validates its existence,
     * executes it with the given parameters, and sends the result back through
     * the messenger. If the tool doesn't exist or execution fails, appropriate
     * error responses are sent.
     *
     * @param id - The request identifier used to correlate responses
     * @param message - The call tool request containing tool name and arguments
     * @returns An effect that processes the tool call and sends the response
     */
    const _handleCallTool = Effect.fn("HandleCallTool")(function* (
      id: RequestId,
      message: CallToolRequest
    ) {
      const toolName = message.params.name;
      const tool = (tk.tools as Record<string, AiTool.Any>)[toolName];
      if (!tool) {
        return yield* messenger.sendError(
          id,
          JsonRpcError.fromCode(
            "InvalidParams",
            "The tool does not exist / is not available."
          )
        );
      }

      const handlerResult = yield* tk.handle(toolName, message.params.arguments as any).pipe(
        Effect.mapError((err) =>
          JsonRpcError.fromCode("InternalError", "Error calling tool", err)
        )
      );

      const result: CallToolResult = {
        content: [
          {
            type: "text",
            text: JSON.stringify(handlerResult.encodedResult),
          },
        ],
      };

      yield* messenger.sendResult(id, result);
    });

    const _handleListResources = Effect.fn("HandleListResources")(function* (
      id: RequestId,
      message: ListResourcesRequest
    ) {
      // TODO: Implement
    });

    const _handleReadResource = Effect.fn("HandleReadResource")(function* (
      id: RequestId,
      message: ReadResourceRequest
    ) {
      // TODO: Implement
    });

    const _handleSubscribeToResourceList = Effect.fn(
      "HandleSubscribeToResourceList"
    )(function* (id: RequestId, message: SubscribeRequest) {
      // TODO: Implement
    });

    const _handleUnsubscribeFromResourceList = Effect.fn(
      "HandleUnsubscribeFromResourceList"
    )(function* (id: RequestId, message: UnsubscribeRequest) {
      // TODO: Implement
    });

    const _handleListResourceTemplates = Effect.fn(
      "HandleListResourceTemplates"
    )(function* (id: RequestId, message: ListResourceTemplatesRequest) {
      // TODO: Implement
    });

    /**
     * Processes a raw JSON-RPC request and dispatches it to the appropriate
     * handler based on the request method.
     *
     * The function validates and decodes the incoming message against the
     * ClientRequest schema, converting any schema decoding failures into
     * a JsonRpcError with a "ParseError" code. Once decoded, the request
     * is routed through pattern matching to one of the supported method
     * handlers (ping, initialize, completion/complete, logging/setLevel,
     * prompts/get, prompts/list, resources/list, resources/read,
     * resources/subscribe, resources/unsubscribe, resources/templates/list,
     * tools/list, tools/call).
     *
     * Any errors encountered during processing are logged, and errors
     * tagged as "JsonRpcError" are forwarded back to the caller via the
     * messenger.
     *
     * @param {JSONRPCRequest} rawMessage - The incoming JSON-RPC request to handle.
     * @returns {Effect} An effect that resolves with the result of the dispatched handler.
     */
    const handleRequest = Effect.fn("HandleRequest")(function* (
      rawMessage: JSONRPCRequest
    ) {
      return yield* Effect.gen(function* () {
        const message = yield* Schema.decodeUnknown(ClientRequest)({
          method: rawMessage.method,
          params: rawMessage.params,
        }).pipe(
          Effect.mapError((error) =>
            JsonRpcError.fromCode("ParseError", error.message, error.issue)
          )
        );

        yield* Effect.log(`Handling request:`, message);

        yield* Match.value(message).pipe(
          Match.when({ method: "ping" }, (msg) =>
            _handlePing(rawMessage.id, msg)
          ),
          Match.when({ method: "initialize" }, (msg) =>
            _handleInitialize(rawMessage.id, msg)
          ),
          Match.when({ method: "completion/complete" }, (msg) =>
            _handleComplete(rawMessage.id, msg)
          ),
          Match.when({ method: "logging/setLevel" }, (msg) =>
            _handleSetLevel(rawMessage.id, msg)
          ),
          Match.when({ method: "prompts/get" }, (msg) =>
            _handleGetPrompt(rawMessage.id, msg)
          ),
          Match.when({ method: "prompts/list" }, (msg) =>
            _handleListPrompts(rawMessage.id, msg)
          ),
          Match.when({ method: "resources/list" }, (msg) =>
            _handleListResources(rawMessage.id, msg)
          ),
          Match.when({ method: "resources/read" }, (msg) =>
            _handleReadResource(rawMessage.id, msg)
          ),
          Match.when({ method: "resources/subscribe" }, (msg) =>
            _handleSubscribeToResourceList(rawMessage.id, msg)
          ),
          Match.when({ method: "resources/unsubscribe" }, (msg) =>
            _handleUnsubscribeFromResourceList(rawMessage.id, msg)
          ),
          Match.when({ method: "resources/templates/list" }, (msg) =>
            _handleListResourceTemplates(rawMessage.id, msg)
          ),
          Match.when({ method: "tools/list" }, (msg) =>
            _handleListTools(rawMessage.id, msg)
          ),
          Match.when({ method: "tools/call" }, (msg) =>
            _handleCallTool(rawMessage.id, msg)
          ),
          Match.exhaustive
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError(`Error handling request: ${err.message}`)
        ),
        Effect.catchTag("JsonRpcError", (err) =>
          messenger.sendError(rawMessage.id, err)
        )
      );
    });

    const handleError = Effect.fn("HandleError")(function* (
      message: JSONRPCError
    ) {
      // TODO: Implement
    });

    /**
     * Handles a JSON-RPC **response** that arrived on the server's inbound
     * transport from the client.
     *
     * Per the MCP spec a server typically receives responses only for the
     * requests *it* issued to the client, namely:
     *   - `sampling/createMessage` → `CreateMessageResult`
     *   - `roots/list`            → `ListRootsResult`
     *   - `ping` (and other void requests) → `EmptyResult`
     *
     * Behaviour:
     *   1. Schema-decode `message.result` against `ClientResult` (the union
     *      of every result type the client is allowed to produce). Decoding
     *      errors are coerced to a `JsonRpcError` with code `ParseError`
     *      and surfaced with the underlying schema issue preserved for
     *      diagnostics.
     *   2. Use `Match` to narrow the decoded union. Each branch is currently
     *      routed to `_notImplemented` — the server does not yet drive any
     *      client-side capability, so successful response handling is a
     *      no-op. The type guards (`"model" in message`, `"roots" in message`)
     *      preserve narrowing inside each branch even though the body is a
     *      placeholder.
     *   3. Any `JsonRpcError` raised during decoding is funnelled back to
     *      the client via `messenger.sendError(message.id, err)`, preserving
     *      the `RequestId` so the client can correlate the failure with its
     *      outstanding request.
     *
     * @param message The raw `JSONRPCResponse` envelope received from the
     *                client. Only `message.id` and `message.result` are
     *                consumed.
     * @returns An Effect that completes once the response has been routed.
     *          Failure values are themselves `JsonRpcError`s and will be
     *          forwarded to the client automatically.
     */
    const handleResponse = Effect.fn("HandleResponse")(function* (
      message: JSONRPCResponse
    ) {
      return yield* Effect.gen(function* () {
        const response = yield* Schema.decodeUnknown(ClientResult)(
          message.result
        ).pipe(
          Effect.mapError((error) =>
            JsonRpcError.fromCode("ParseError", error.message, error.issue)
          )
        );

        Match.value(response).pipe(
          Match.when(
            (message): message is CreateMessageResult => "model" in message,
            _notImplemented
          ),
          Match.when(
            (message): message is ListRootsResult => "roots" in message,
            _notImplemented
          ),
          // Empty response
          Match.orElse(_notImplemented)
        );
      }).pipe(
        Effect.catchTag("JsonRpcError", (err) =>
          messenger.sendError(message.id, err)
        )
      );
    });

    const handleNotification = Effect.fn("HandleNotification")(function* (
      message: JSONRPCNotification
    ) {
      return yield* Effect.gen(function* () {
        const notification = yield* Schema.decodeUnknown(ClientNotification)({
          method: message.method,
          params: message.params,
        }).pipe(
          Effect.mapError((error) =>
            JsonRpcError.fromCode("ParseError", error.message, error.issue)
          )
        );

        yield* Match.value(notification).pipe(
          Match.when({ method: "notifications/cancelled" }, (msg) =>
            _notImplemented(msg)
          ),
          Match.when({ method: "notifications/progress" }, (msg) =>
            _notImplemented(msg)
          ),
          Match.when({ method: "notifications/initialized" }, (msg) =>
            _notImplemented(msg)
          ),
          Match.when({ method: "notifications/roots/list_changed" }, (msg) =>
            _notImplemented(msg)
          ),
          Match.exhaustive
        );
      }).pipe(
        Effect.catchTag("JsonRpcError", (err) =>
          Effect.logError(`Error handling notification: ${err.message}`)
        )
      );
    });

    return {
      handleRequest,
      handleError,
      handleResponse,
      handleNotification,
    } satisfies MCP.MCP.Service;
  });

/**
 * Creates a layer that provides MCP (Model Context Protocol) implementation with the specified configuration and toolkit.
 * The layer is configured to merge with the default messenger layer.
 *
 * @template Tools - Record type mapping tool names to their corresponding AI tool implementations
 * @param config - The implementation configuration for the MCP
 * @param toolkit - Optional toolkit containing available tools, defaults to an empty toolkit
 * @returns A layer that provides the MCP implementation merged with the default messenger
 */
export const layer = <Tools extends Record<string, AiTool.Any>>(
  config: Implementation,
  toolkit: ToolkitType<Tools> = Toolkit.empty as unknown as ToolkitType<Tools>
) =>
  Layer.effect(MCP.MCP, make(config, toolkit)).pipe(
    Layer.provideMerge(Messenger.Default)
  );

/**
 *
 * Internal utilities copied from `@effect/ai` since they are not exported.
 */

/**
 * Generates a JSON Schema from an Abstract Syntax Tree (AST).
 *
 * This function converts an AST representation into a JSON Schema draft 7 compliant schema.
 * It processes the AST to create schema definitions and handles references appropriately.
 * If definitions are generated during the conversion process, they are attached to the
 * schema under the $defs property.
 *
 * @param ast - The Abstract Syntax Tree to convert into a JSON Schema
 * @returns A JSON Schema draft 7 object representing the structure defined by the AST
 */
const makeJsonSchema = (ast: AST.AST): JsonSchema.JsonSchema7 => {
  const $defs = {};
  const schema = JsonSchema.fromAST(ast, {
    definitions: $defs,
    topLevelReferenceStrategy: "skip",
  });
  if (Object.keys($defs).length === 0) return schema;
  (schema as any).$defs = $defs;
  return schema;
};
