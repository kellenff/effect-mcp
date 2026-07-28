import { bench, describe } from "vitest";
import {
  CallToolRequest,
  CallToolResult,
  CancelledNotification,
  EmptyResult,
  InitializeRequest,
  InitializeResult,
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  ListToolsRequest,
  ListToolsResult,
  PingRequest,
  ProgressNotification,
} from "./schema.js";
import * as Schema from "effect/Schema";

const pingRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "ping",
  id: "1",
});

const pingRequestJS = {
  jsonrpc: "2.0",
  method: "ping",
  id: "1",
};

const initializeRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "bench", version: "0.0.1" },
  },
  id: "2",
});

const initializeRequestJS = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "bench", version: "0.0.1" },
  },
  id: "2",
};

const callToolRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "Echo",
    arguments: { message: "hello world" },
  },
  id: "3",
});

const callToolRequestJS = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "Echo",
    arguments: { message: "hello world" },
  },
  id: "3",
};

const listToolsRequest = JSONRPCRequest.make({
  jsonrpc: "2.0",
  method: "tools/list",
  id: "4",
});

const listToolsRequestJS = {
  jsonrpc: "2.0",
  method: "tools/list",
  id: "4",
};

const notification: JSONRPCNotification = {
  jsonrpc: "2.0",
  method: "notifications/cancelled",
  params: { requestId: "1", reason: "test" },
};

const progressNotification: JSONRPCNotification = {
  jsonrpc: "2.0",
  method: "notifications/progress",
  params: {
    progressToken: "tok-1",
    progress: 0.5,
    total: 1,
  },
};

const response: JSONRPCResponse = {
  jsonrpc: "2.0",
  id: "1",
  result: { _meta: { pong: true } },
};

const errorMessage: JSONRPCError = {
  jsonrpc: "2.0",
  id: "1",
  error: { code: -32601, message: "Method not found" },
};

const callToolResult = {
  ...JSONRPCResponse.make({
    jsonrpc: "2.0",
    id: "5",
    result: {
      content: [{ type: "text", text: "Echo: hello world" }],
      isError: false,
    },
  }),
};

const callToolResultJS = {
  jsonrpc: "2.0",
  id: "5",
  result: {
    content: [{ type: "text", text: "Echo: hello world" }],
    isError: false,
  },
};

describe("Schema decode from plain JS", () => {
  bench("JSONRPCMessage.union (PingRequest)", () => {
    Schema.decodeUnknownSync(JSONRPCMessage)(pingRequestJS);
  });

  bench("ClientRequest.union (Initialize)", () => {
    Schema.decodeUnknownSync(InitializeRequest)(initializeRequestJS);
  });

  bench("ClientRequest.union (CallTool)", () => {
    Schema.decodeUnknownSync(CallToolRequest)(callToolRequestJS);
  });

  bench("ClientRequest.union (ListTools)", () => {
    Schema.decodeUnknownSync(ListToolsRequest)(listToolsRequestJS);
  });

  bench("JSONRPCNotification (cancelled)", () => {
    Schema.decodeUnknownSync(CancelledNotification)(notification);
  });

  bench("JSONRPCNotification (progress)", () => {
    Schema.decodeUnknownSync(ProgressNotification)(progressNotification);
  });

  bench("JSONRPCResponse", () => {
    Schema.decodeUnknownSync(JSONRPCResponse)(response);
  });

  bench("JSONRPCError", () => {
    Schema.decodeUnknownSync(JSONRPCError)(errorMessage);
  });

  bench("PingRequest (narrowest)", () => {
    Schema.decodeUnknownSync(PingRequest)(pingRequestJS);
  });

  bench("CallToolResult", () => {
    Schema.decodeUnknownSync(CallToolResult)(callToolResultJS.result);
  });
});

describe("Schema encode to plain JS", () => {
  bench("JSONRPCMessage (PingRequest)", () => {
    Schema.encodeSync(JSONRPCMessage)(pingRequest);
  });

  bench("InitializeRequest", () => {
    Schema.encodeSync(InitializeRequest)(initializeRequest);
  });

  bench("CallToolRequest", () => {
    Schema.encodeSync(CallToolRequest)(callToolRequest);
  });

  bench("ListToolsRequest", () => {
    Schema.encodeSync(ListToolsRequest)(listToolsRequest);
  });

  bench("JSONRPCNotification (cancelled)", () => {
    Schema.encodeSync(JSONRPCNotification)(notification);
  });

  bench("JSONRPCResponse", () => {
    Schema.encodeSync(JSONRPCResponse)(response);
  });

  bench("EmptyResult", () => {
    Schema.encodeSync(EmptyResult)({ _meta: { pong: true } });
  });

  bench("JSONRPCResponse (CallToolResult)", () => {
    Schema.encodeSync(JSONRPCResponse)(callToolResult);
  });

  bench("ListToolsResult (10 tools)", () => {
    Schema.encodeSync(ListToolsResult)({
      tools: Array.from({ length: 10 }, (_, i) => ({
        name: `tool_${i}`,
        description: `Tool number ${i}`,
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
      })),
    });
  });

  bench("InitializeResult", () => {
    Schema.encodeSync(InitializeResult)({
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        resourceTemplates: {},
      },
      serverInfo: { name: "bench", version: "0.0.1" },
    });
  });
});

describe("Round-trip encode + decode", () => {
  bench("PingRequest", () => {
    const encoded = Schema.encodeSync(JSONRPCMessage)(pingRequest);
    Schema.decodeUnknownSync(JSONRPCMessage)(encoded);
  });

  bench("CallToolRequest", () => {
    const encoded = Schema.encodeSync(JSONRPCMessage)(callToolRequest);
    Schema.decodeUnknownSync(JSONRPCMessage)(encoded);
  });

  bench("CallToolResult", () => {
    const encoded = Schema.encodeSync(JSONRPCResponse)(callToolResult);
    Schema.decodeUnknownSync(JSONRPCResponse)(encoded);
  });
});
