import * as Schema from "effect/Schema";

export const LATEST_PROTOCOL_VERSION = "2024-11-05";
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  "2024-10-07",
];

export const JSONRPC_VERSION = "2.0";

// Basic schemas
export const ProgressToken = Schema.Union(
  Schema.String,
  Schema.Number.pipe(Schema.int())
);
export type ProgressToken = Schema.Schema.Type<typeof ProgressToken>;

export const Cursor = Schema.String;
export type Cursor = Schema.Schema.Type<typeof Cursor>;

const UnknownStruct = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

const BaseRequestParams = Schema.Struct(
  Schema.Struct({
    _meta: Schema.Struct(
      Schema.Struct({
        progressToken: Schema.optional(ProgressToken),
      }).fields,
      UnknownStruct
    ).pipe(Schema.optional),
  }).fields,
  UnknownStruct
);

export const Request = Schema.Struct({
  method: Schema.String,
  params: Schema.optional(BaseRequestParams),
});
export type Request = Schema.Schema.Type<typeof Request>;

const BaseNotificationParams = Schema.Struct(
  Schema.Struct({
    _meta: Schema.Object.pipe(Schema.optional),
  }).fields,
  UnknownStruct
);

export const Notification = Schema.Struct({
  method: Schema.String,
  params: Schema.optional(BaseNotificationParams),
});
export type Notification = Schema.Schema.Type<typeof Notification>;

export const Result = Schema.Struct(
  Schema.Struct({
    _meta: Schema.Object.pipe(Schema.optional),
  }).fields,
  UnknownStruct
);
export type Result = Schema.Schema.Type<typeof Result>;

export const RequestId = Schema.Union(
  Schema.String,
  Schema.Number.pipe(Schema.int())
).pipe(Schema.brand("RequestId"));
export type RequestId = Schema.Schema.Type<typeof RequestId>;

// JSON-RPC schemas
export const JSONRPCRequest = Schema.Struct({
  ...Request.fields,
  jsonrpc: Schema.Literal(JSONRPC_VERSION),
  id: RequestId,
});
export type JSONRPCRequest = Schema.Schema.Type<typeof JSONRPCRequest>;

export const JSONRPCNotification = Schema.Struct({
  ...Notification.fields,
  jsonrpc: Schema.Literal(JSONRPC_VERSION),
});
export type JSONRPCNotification = Schema.Schema.Type<
  typeof JSONRPCNotification
>;

export const JSONRPCResponse = Schema.Struct({
  jsonrpc: Schema.Literal(JSONRPC_VERSION),
  id: RequestId,
  result: Result,
});
export type JSONRPCResponse = Schema.Schema.Type<typeof JSONRPCResponse>;

export const JSONRPCError = Schema.Struct({
  jsonrpc: Schema.Literal(JSONRPC_VERSION),
  id: RequestId,
  error: Schema.Struct({
    code: Schema.Number.pipe(Schema.int()),
    message: Schema.String,
    data: Schema.optional(Schema.Unknown),
  }),
});
export type JSONRPCError = Schema.Schema.Type<typeof JSONRPCError>;

export const JSONRPCMessage = Schema.Union(
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError
);
export type JSONRPCMessage = Schema.Schema.Type<typeof JSONRPCMessage>;

export const EmptyResult = Result.annotations({
  parseOptions: { onExcessProperty: "ignore" },
});
export type EmptyResult = Schema.Schema.Type<typeof EmptyResult>;

export const CancelledNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/cancelled"),
  params: Schema.Struct({
    ...BaseNotificationParams.fields,
    requestId: RequestId,
    reason: Schema.String.pipe(Schema.optional),
  }),
});
export type CancelledNotification = Schema.Schema.Type<
  typeof CancelledNotification
>;

export const Implementation = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
}).annotations({
  parseOptions: {
    onExcessProperty: "preserve",
  },
});
export type Implementation = Schema.Schema.Type<typeof Implementation>;

/**
 * Capabilities a client may support
 */
export const ClientCapabilities = Schema.Struct(
  Schema.Struct({
    experimental: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    sampling: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    roots: Schema.optional(
      Schema.Struct(
        Schema.Struct({
          listChanged: Schema.optional(Schema.Boolean),
        }).fields,
        UnknownStruct
      )
    ),
  }).fields,
  UnknownStruct
);
export type ClientCapabilities = Schema.Schema.Type<typeof ClientCapabilities>;

/**
 * Initialize request schema
 */
export const InitializeRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("initialize"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    protocolVersion: Schema.String,
    capabilities: ClientCapabilities,
    clientInfo: Implementation,
  }),
});
export type InitializeRequest = Schema.Schema.Type<typeof InitializeRequest>;

/**
 * Server capabilities schema
 */
export const ServerCapabilities = Schema.Struct(
  Schema.Struct({
    experimental: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    logging: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    prompts: Schema.optional(
      Schema.Struct(
        Schema.Struct({
          listChanged: Schema.optional(Schema.Boolean),
        }).fields,
        UnknownStruct
      )
    ),
    resources: Schema.optional(
      Schema.Struct(
        Schema.Struct({
          subscribe: Schema.optional(Schema.Boolean),
          listChanged: Schema.optional(Schema.Boolean),
        }).fields,
        UnknownStruct
      )
    ),
    tools: Schema.optional(
      Schema.Struct(
        Schema.Struct({
          listChanged: Schema.optional(Schema.Boolean),
        }).fields,
        UnknownStruct
      )
    ),
  }).fields,
  UnknownStruct
);
export type ServerCapabilities = Schema.Schema.Type<typeof ServerCapabilities>;

/**
 * After receiving an initialize request from the client, the server sends this response.
 */
export const InitializeResult = Schema.Struct({
  ...Result.fields,
  /**
   * The version of the Model Context Protocol that the server wants to use. This may not match the version that the client requested. If the client cannot support this version, it MUST disconnect.
   */
  protocolVersion: Schema.String,
  capabilities: ServerCapabilities,
  serverInfo: Implementation,
  /**
   * Instructions describing how to use the server and its features.
   *
   * This can be used by clients to improve the LLM's understanding of available tools, resources, etc. It can be thought of like a "hint" to the model. For example, this information MAY be added to the system prompt.
   */
  instructions: Schema.optional(Schema.String),
});
export type InitializeResult = Schema.Schema.Type<typeof InitializeResult>;

/**
 * This notification is sent from the client to the server after initialization has finished.
 */
export const InitializedNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/initialized"),
});
export type InitializedNotification = Schema.Schema.Type<
  typeof InitializedNotification
>;

/* Ping */
/**
 * A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
 */
export const PingRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("ping"),
});
export type PingRequest = Schema.Schema.Type<typeof PingRequest>;

/* Progress notifications */
export const Progress = Schema.Struct(
  Schema.Struct({
    progress: Schema.Number,
    total: Schema.optional(Schema.Number),
  }).fields,
  UnknownStruct
);
export type Progress = Schema.Schema.Type<typeof Progress>;

export const ProgressNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/progress"),
  params: Schema.Struct({
    ...BaseNotificationParams.fields,
    ...Progress.fields,
    progressToken: ProgressToken,
  }),
});
export type ProgressNotification = Schema.Schema.Type<
  typeof ProgressNotification
>;

/* Pagination */
export const PaginatedRequest = Schema.Struct({
  ...Request.fields,
  params: Schema.optional(
    Schema.Struct({
      ...BaseRequestParams.fields,
      cursor: Schema.optional(Cursor),
    })
  ),
});
export type PaginatedRequest = Schema.Schema.Type<typeof PaginatedRequest>;

export const PaginatedResult = Schema.Struct({
  ...Result.fields,
  nextCursor: Schema.optional(Cursor),
});
export type PaginatedResult = Schema.Schema.Type<typeof PaginatedResult>;

/* Resources */
export const ResourceContents = Schema.Struct(
  Schema.Struct({
    uri: Schema.String,
    mimeType: Schema.optional(Schema.String),
  }).fields,
  UnknownStruct
);
export type ResourceContents = Schema.Schema.Type<typeof ResourceContents>;

export const TextResourceContents = Schema.Struct({
  ...ResourceContents.fields,
  text: Schema.String,
});
export type TextResourceContents = Schema.Schema.Type<
  typeof TextResourceContents
>;

export const BlobResourceContents = Schema.Struct({
  ...ResourceContents.fields,
  blob: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9+/]*={0,2}$/)), // base64 pattern
});
export type BlobResourceContents = Schema.Schema.Type<
  typeof BlobResourceContents
>;

export const Resource = Schema.Struct(
  Schema.Struct({
    uri: Schema.String,
    name: Schema.String,
    description: Schema.optional(Schema.String),
    mimeType: Schema.optional(Schema.String),
  }).fields,
  UnknownStruct
);
export type Resource = Schema.Schema.Type<typeof Resource>;

export const ResourceTemplate = Schema.Struct(
  Schema.Struct({
    uriTemplate: Schema.String,
    name: Schema.String,
    description: Schema.optional(Schema.String),
    mimeType: Schema.optional(Schema.String),
  }).fields,
  UnknownStruct
);
export type ResourceTemplate = Schema.Schema.Type<typeof ResourceTemplate>;

export const ListResourcesRequest = Schema.Struct({
  ...PaginatedRequest.fields,
  method: Schema.Literal("resources/list"),
});
export type ListResourcesRequest = Schema.Schema.Type<
  typeof ListResourcesRequest
>;

export const ListResourcesResult = Schema.Struct({
  ...PaginatedResult.fields,
  resources: Schema.Array(Resource),
});
export type ListResourcesResult = Schema.Schema.Type<
  typeof ListResourcesResult
>;

export const ListResourceTemplatesRequest = Schema.Struct({
  ...PaginatedRequest.fields,
  method: Schema.Literal("resources/templates/list"),
});
export type ListResourceTemplatesRequest = Schema.Schema.Type<
  typeof ListResourceTemplatesRequest
>;

export const ListResourceTemplatesResult = Schema.Struct({
  ...PaginatedResult.fields,
  resourceTemplates: Schema.Array(ResourceTemplate),
});
export type ListResourceTemplatesResult = Schema.Schema.Type<
  typeof ListResourceTemplatesResult
>;

export const ReadResourceRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("resources/read"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    uri: Schema.String,
  }),
});
export type ReadResourceRequest = Schema.Schema.Type<
  typeof ReadResourceRequest
>;

export const ReadResourceResult = Schema.Struct({
  ...Result.fields,
  contents: Schema.Array(
    Schema.Union(TextResourceContents, BlobResourceContents)
  ),
});
export type ReadResourceResult = Schema.Schema.Type<typeof ReadResourceResult>;

export const ResourceListChangedNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/resources/list_changed"),
});
export type ResourceListChangedNotification = Schema.Schema.Type<
  typeof ResourceListChangedNotification
>;

export const SubscribeRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("resources/subscribe"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    uri: Schema.String,
  }),
});
export type SubscribeRequest = Schema.Schema.Type<typeof SubscribeRequest>;

export const UnsubscribeRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("resources/unsubscribe"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    uri: Schema.String,
  }),
});
export type UnsubscribeRequest = Schema.Schema.Type<typeof UnsubscribeRequest>;

export const ResourceUpdatedNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/resources/updated"),
  params: Schema.Struct({
    ...BaseNotificationParams.fields,
    uri: Schema.String,
  }),
});
export type ResourceUpdatedNotification = Schema.Schema.Type<
  typeof ResourceUpdatedNotification
>;

/* Prompts */
export const PromptArgument = Schema.Struct(
  Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.String),
    required: Schema.optional(Schema.Boolean),
  }).fields,
  UnknownStruct
);
export type PromptArgument = Schema.Schema.Type<typeof PromptArgument>;

export const Prompt = Schema.Struct(
  Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.String),
    arguments: Schema.optional(Schema.Array(PromptArgument)),
  }).fields,
  UnknownStruct
);
export type Prompt = Schema.Schema.Type<typeof Prompt>;

export const ListPromptsRequest = Schema.Struct({
  ...PaginatedRequest.fields,
  method: Schema.Literal("prompts/list"),
});
export type ListPromptsRequest = Schema.Schema.Type<typeof ListPromptsRequest>;

export const ListPromptsResult = Schema.Struct({
  ...PaginatedResult.fields,
  prompts: Schema.Array(Prompt),
});
export type ListPromptsResult = Schema.Schema.Type<typeof ListPromptsResult>;

export const GetPromptRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("prompts/get"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    name: Schema.String,
    arguments: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.String })
    ),
  }),
});
export type GetPromptRequest = Schema.Schema.Type<typeof GetPromptRequest>;

export const TextContent = Schema.Struct(
  Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String,
  }).fields,
  UnknownStruct
);
export type TextContent = Schema.Schema.Type<typeof TextContent>;

export const ImageContent = Schema.Struct(
  Schema.Struct({
    type: Schema.Literal("image"),
    data: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9+/]*={0,2}$/)), // base64 pattern
    mimeType: Schema.String,
  }).fields,
  UnknownStruct
);
export type ImageContent = Schema.Schema.Type<typeof ImageContent>;

export const EmbeddedResource = Schema.Struct(
  Schema.Struct({
    type: Schema.Literal("resource"),
    resource: Schema.Union(TextResourceContents, BlobResourceContents),
  }).fields,
  UnknownStruct
);
export type EmbeddedResource = Schema.Schema.Type<typeof EmbeddedResource>;

export const PromptMessage = Schema.Struct(
  Schema.Struct({
    role: Schema.Union(Schema.Literal("user"), Schema.Literal("assistant")),
    content: Schema.Union(TextContent, ImageContent, EmbeddedResource),
  }).fields,
  UnknownStruct
);
export type PromptMessage = Schema.Schema.Type<typeof PromptMessage>;

export const GetPromptResult = Schema.Struct({
  ...Result.fields,
  description: Schema.optional(Schema.String),
  messages: Schema.Array(PromptMessage),
});
export type GetPromptResult = Schema.Schema.Type<typeof GetPromptResult>;

export const PromptListChangedNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/prompts/list_changed"),
});
export type PromptListChangedNotification = Schema.Schema.Type<
  typeof PromptListChangedNotification
>;

/* Tools */
export const Tool = Schema.Struct(
  Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.String),
    inputSchema: Schema.Struct(
      Schema.Struct({
        type: Schema.Literal("object"),
        properties: Schema.optional(
          Schema.Record({ key: Schema.String, value: Schema.Unknown })
        ),
      }).fields,
      UnknownStruct
    ),
  }).fields,
  UnknownStruct
);
export type Tool = Schema.Schema.Type<typeof Tool>;

export const ListToolsRequest = Schema.Struct({
  ...PaginatedRequest.fields,
  method: Schema.Literal("tools/list"),
});
export type ListToolsRequest = Schema.Schema.Type<typeof ListToolsRequest>;

export const ListToolsResult = Schema.Struct({
  ...PaginatedResult.fields,
  tools: Schema.Array(Tool),
});
export type ListToolsResult = Schema.Schema.Type<typeof ListToolsResult>;

export const CallToolResult = Schema.Struct({
  ...Result.fields,
  content: Schema.Array(
    Schema.Union(TextContent, ImageContent, EmbeddedResource)
  ),
  isError: Schema.optional(Schema.Boolean),
});
export type CallToolResult = Schema.Schema.Type<typeof CallToolResult>;

export const CompatibilityCallToolResult = Schema.Union(
  CallToolResult,
  Schema.Struct({
    ...Result.fields,
    toolResult: Schema.Unknown,
  })
);
export type CompatibilityCallToolResult = Schema.Schema.Type<
  typeof CompatibilityCallToolResult
>;

export const CallToolRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    name: Schema.String,
    arguments: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
  }),
});
export type CallToolRequest = Schema.Schema.Type<typeof CallToolRequest>;

export const ToolListChangedNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/tools/list_changed"),
});
export type ToolListChangedNotification = Schema.Schema.Type<
  typeof ToolListChangedNotification
>;

/* Logging */
export const LoggingLevel = Schema.Literal(
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
);
export type LoggingLevel = Schema.Schema.Type<typeof LoggingLevel>;

export const SetLevelRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("logging/setLevel"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    level: LoggingLevel,
  }),
});
export type SetLevelRequest = Schema.Schema.Type<typeof SetLevelRequest>;

export const LoggingMessageNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/message"),
  params: Schema.Struct({
    ...BaseNotificationParams.fields,
    level: LoggingLevel,
    logger: Schema.optional(Schema.String),
    data: Schema.Unknown,
  }),
});
export type LoggingMessageNotification = Schema.Schema.Type<
  typeof LoggingMessageNotification
>;

/* Sampling */
export const ModelHint = Schema.Struct(
  Schema.Struct({
    name: Schema.optional(Schema.String),
  }).fields,
  UnknownStruct
);
export type ModelHint = Schema.Schema.Type<typeof ModelHint>;

export const ModelPreferences = Schema.Struct(
  Schema.Struct({
    hints: Schema.optional(Schema.Array(ModelHint)),
    costPriority: Schema.optional(Schema.Number.pipe(Schema.between(0, 1))),
    speedPriority: Schema.optional(Schema.Number.pipe(Schema.between(0, 1))),
    intelligencePriority: Schema.optional(
      Schema.Number.pipe(Schema.between(0, 1))
    ),
  }).fields,
  UnknownStruct
);
export type ModelPreferences = Schema.Schema.Type<typeof ModelPreferences>;

export const SamplingMessage = Schema.Struct(
  Schema.Struct({
    role: Schema.Union(Schema.Literal("user"), Schema.Literal("assistant")),
    content: Schema.Union(TextContent, ImageContent),
  }).fields,
  UnknownStruct
);
export type SamplingMessage = Schema.Schema.Type<typeof SamplingMessage>;

export const CreateMessageRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("sampling/createMessage"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    messages: Schema.Array(SamplingMessage),
    systemPrompt: Schema.optional(Schema.String),
    includeContext: Schema.optional(
      Schema.Union(
        Schema.Literal("none"),
        Schema.Literal("thisServer"),
        Schema.Literal("allServers")
      )
    ),
    temperature: Schema.optional(Schema.Number),
    maxTokens: Schema.Number.pipe(Schema.int()),
    stopSequences: Schema.optional(Schema.Array(Schema.String)),
    metadata: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    modelPreferences: Schema.optional(ModelPreferences),
  }),
});
export type CreateMessageRequest = Schema.Schema.Type<
  typeof CreateMessageRequest
>;

export const CreateMessageResult = Schema.Struct({
  ...Result.fields,
  model: Schema.String,
  stopReason: Schema.optional(
    Schema.Union(
      Schema.Literal("endTurn"),
      Schema.Literal("stopSequence"),
      Schema.Literal("maxTokens"),
      Schema.String
    )
  ),
  role: Schema.Union(Schema.Literal("user"), Schema.Literal("assistant")),
  content: Schema.Union(TextContent, ImageContent),
});
export type CreateMessageResult = Schema.Schema.Type<
  typeof CreateMessageResult
>;

/* Autocomplete */
export const ResourceReference = Schema.Struct(
  Schema.Struct({
    type: Schema.Literal("ref/resource"),
    uri: Schema.String,
  }).fields,
  UnknownStruct
);
export type ResourceReference = Schema.Schema.Type<typeof ResourceReference>;

export const PromptReference = Schema.Struct(
  Schema.Struct({
    type: Schema.Literal("ref/prompt"),
    name: Schema.String,
  }).fields,
  UnknownStruct
);
export type PromptReference = Schema.Schema.Type<typeof PromptReference>;

export const CompleteRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("completion/complete"),
  params: Schema.Struct({
    ...BaseRequestParams.fields,
    ref: Schema.Union(PromptReference, ResourceReference),
    argument: Schema.Struct(
      Schema.Struct({
        name: Schema.String,
        value: Schema.String,
      }).fields,
      UnknownStruct
    ),
  }),
});
export type CompleteRequest = Schema.Schema.Type<typeof CompleteRequest>;

export const CompleteResult = Schema.Struct({
  ...Result.fields,
  completion: Schema.Struct(
    Schema.Struct({
      values: Schema.Array(Schema.String).pipe(Schema.maxItems(100)),
      total: Schema.optional(Schema.Number.pipe(Schema.int())),
      hasMore: Schema.optional(Schema.Boolean),
    }).fields,
    UnknownStruct
  ),
});
export type CompleteResult = Schema.Schema.Type<typeof CompleteResult>;

/* Roots */
export const Root = Schema.Struct(
  Schema.Struct({
    uri: Schema.String.pipe(Schema.startsWith("file://")),
    name: Schema.optional(Schema.String),
  }).fields,
  UnknownStruct
);

export const ListRootsRequest = Schema.Struct({
  ...Request.fields,
  method: Schema.Literal("roots/list"),
});
export type ListRootsRequest = Schema.Schema.Type<typeof ListRootsRequest>;

export const ListRootsResult = Schema.Struct({
  ...Result.fields,
  roots: Schema.Array(Root),
});
export type ListRootsResult = Schema.Schema.Type<typeof ListRootsResult>;

export const RootsListChangedNotification = Schema.Struct({
  ...Notification.fields,
  method: Schema.Literal("notifications/roots/list_changed"),
});
export type RootsListChangedNotification = Schema.Schema.Type<
  typeof RootsListChangedNotification
>;

/* Client messages */
export const ClientRequest = Schema.Union(
  PingRequest,
  InitializeRequest,
  CompleteRequest,
  SetLevelRequest,
  GetPromptRequest,
  ListPromptsRequest,
  ListResourcesRequest,
  ListResourceTemplatesRequest,
  ReadResourceRequest,
  SubscribeRequest,
  UnsubscribeRequest,
  CallToolRequest,
  ListToolsRequest
);
export type ClientRequest = Schema.Schema.Type<typeof ClientRequest>;

export const ClientNotification = Schema.Union(
  CancelledNotification,
  ProgressNotification,
  InitializedNotification,
  RootsListChangedNotification
);
export type ClientNotification = Schema.Schema.Type<typeof ClientNotification>;

export const ClientResult = Schema.Union(
  EmptyResult,
  CreateMessageResult,
  ListRootsResult
);
export type ClientResult = Schema.Schema.Type<typeof ClientResult>;

/* Server messages */
export const ServerRequest = Schema.Union(
  PingRequest,
  CreateMessageRequest,
  ListRootsRequest
);
export type ServerRequest = Schema.Schema.Type<typeof ServerRequest>;

export const ServerNotification = Schema.Union(
  CancelledNotification,
  ProgressNotification,
  LoggingMessageNotification,
  ResourceUpdatedNotification,
  ResourceListChangedNotification,
  ToolListChangedNotification,
  PromptListChangedNotification
);
export type ServerNotification = Schema.Schema.Type<typeof ServerNotification>;

export const ServerResult = Schema.Union(
  EmptyResult,
  InitializeResult,
  CompleteResult,
  GetPromptResult,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
  CallToolResult,
  ListToolsResult
);
export type ServerResult = Schema.Schema.Type<typeof ServerResult>;
