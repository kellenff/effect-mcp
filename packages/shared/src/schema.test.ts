import { describe, it, expect } from "vitest";
import * as Schema from "effect/Schema";
import {
  ProgressToken,
  Cursor,
  Request,
  Notification,
  Result,
  RequestId,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCMessage,
  EmptyResult,
  Implementation,
  ClientCapabilities,
  InitializeRequest,
  InitializeResult,
  InitializedNotification,
  PingRequest,
  CancelledNotification,
  Progress,
  ProgressNotification,
  PaginatedRequest,
  PaginatedResult,
  LoggingLevel,
  SetLevelRequest,
  LoggingMessageNotification,
  ListRootsRequest,
  ListRootsResult,
  RootsListChangedNotification,
  Root,
} from "./schema.js";

describe("RequestId", () => {
  it("decodes a string id", () => {
    expect(Schema.decodeUnknownSync(RequestId)("abc")).toBe("abc");
  });

  it("decodes an integer number id", () => {
    expect(Schema.decodeUnknownSync(RequestId)(42)).toBe(42);
  });

  it("rejects non-integer numbers", () => {
    expect(() => Schema.decodeUnknownSync(RequestId)(1.5)).toThrow();
  });

  it("rejects booleans", () => {
    expect(() => Schema.decodeUnknownSync(RequestId)(true)).toThrow();
  });
});

describe("ProgressToken", () => {
  it("decodes a string token", () => {
    expect(Schema.decodeUnknownSync(ProgressToken)("t1")).toBe("t1");
  });

  it("decodes an integer token", () => {
    expect(Schema.decodeUnknownSync(ProgressToken)(7)).toBe(7);
  });

  it("rejects non-integer numbers", () => {
    expect(() => Schema.decodeUnknownSync(ProgressToken)(1.5)).toThrow();
  });
});

describe("Cursor", () => {
  it("decodes a string", () => {
    expect(Schema.decodeUnknownSync(Cursor)("c1")).toBe("c1");
  });

  it("rejects a number", () => {
    expect(() => Schema.decodeUnknownSync(Cursor)(42)).toThrow();
  });
});

describe("Request", () => {
  it("requires method", () => {
    expect(() => Schema.decodeUnknownSync(Request)({})).toThrow();
  });

  it("accepts a request with method and params", () => {
    const decoded = Schema.decodeUnknownSync(Request)({
      method: "ping",
      params: { _meta: { progressToken: "t1" } },
    });
    expect(decoded.method).toBe("ping");
  });
});

describe("Notification", () => {
  it("requires method", () => {
    expect(() => Schema.decodeUnknownSync(Notification)({})).toThrow();
  });
});

describe("Result", () => {
  it("decodes an empty result object", () => {
    expect(Schema.decodeUnknownSync(Result)({})).toEqual({});
  });
});

describe("EmptyResult", () => {
  it("round-trips an empty result", () => {
    const decoded = Schema.decodeUnknownSync(EmptyResult)({});
    expect(decoded).toEqual({});
  });
});

describe("JSONRPCRequest", () => {
  it("round-trips a request", () => {
    const original = { jsonrpc: "2.0" as const, id: 1, method: "ping" };
    const encoded = Schema.encodeSync(JSONRPCRequest)(original);
    expect(Schema.decodeUnknownSync(JSONRPCRequest)(encoded)).toEqual(original);
  });

  it("requires the jsonrpc literal '2.0'", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCRequest)({
        jsonrpc: "1.0",
        id: 1,
        method: "ping",
      })
    ).toThrow();
  });

  it("requires id", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCRequest)({
        jsonrpc: "2.0",
        method: "ping",
      })
    ).toThrow();
  });

  it("requires method", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCRequest)({ jsonrpc: "2.0", id: 1 })
    ).toThrow();
  });

  it("accepts a string id", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCRequest)({
      jsonrpc: "2.0",
      id: "req-1",
      method: "ping",
    });
    expect(decoded.id).toBe("req-1");
  });
});

describe("JSONRPCNotification", () => {
  it("round-trips a notification (no id)", () => {
    const original = {
      jsonrpc: "2.0" as const,
      method: "notifications/initialized",
    };
    const encoded = Schema.encodeSync(JSONRPCNotification)(original);
    expect(Schema.decodeUnknownSync(JSONRPCNotification)(encoded)).toEqual(original);
  });
});

describe("JSONRPCResponse", () => {
  it("round-trips a response", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      result: { value: true },
    };
    const encoded = Schema.encodeSync(JSONRPCResponse)(original);
    expect(Schema.decodeUnknownSync(JSONRPCResponse)(encoded)).toEqual(original);
  });

  it("requires result", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCResponse)({ jsonrpc: "2.0", id: 1 })
    ).toThrow();
  });
});

describe("JSONRPCError", () => {
  it("round-trips an error", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: 1,
      error: { code: -32600, message: "invalid" },
    };
    const encoded = Schema.encodeSync(JSONRPCError)(original);
    expect(Schema.decodeUnknownSync(JSONRPCError)(encoded)).toEqual(original);
  });

  it("requires error.code to be an integer", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCError)({
        jsonrpc: "2.0",
        id: 1,
        error: { code: 1.5, message: "x" },
      })
    ).toThrow();
  });

  it("requires error.message", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCError)({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600 },
      })
    ).toThrow();
  });
});

describe("JSONRPCMessage", () => {
  it("decodes a request", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    expect(decoded).toMatchObject({ jsonrpc: "2.0", id: 1, method: "ping" });
  });

  it("decodes a notification", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(decoded).toMatchObject({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  });

  it("decodes a response", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    });
    expect(decoded).toMatchObject({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("decodes an error", () => {
    const decoded = Schema.decodeUnknownSync(JSONRPCMessage)({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "x" },
    });
    expect(decoded).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "x" },
    });
  });

  it("rejects messages missing jsonrpc", () => {
    expect(() =>
      Schema.decodeUnknownSync(JSONRPCMessage)({ id: 1, method: "ping" })
    ).toThrow();
  });
});

describe("Implementation", () => {
  it("requires name and version", () => {
    expect(() =>
      Schema.decodeUnknownSync(Implementation)({ name: "x" })
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Implementation)({ version: "1.0" })
    ).toThrow();
  });

  it("decodes a valid implementation", () => {
    const decoded = Schema.decodeUnknownSync(Implementation)({
      name: "test",
      version: "1.0.0",
    });
    expect(decoded).toEqual({ name: "test", version: "1.0.0" });
  });
});

describe("ClientCapabilities", () => {
  it("decodes an empty capabilities object", () => {
    const decoded = Schema.decodeUnknownSync(ClientCapabilities)({});
    expect(decoded).toEqual({});
  });

  it("decodes roots.listChanged boolean", () => {
    const decoded = Schema.decodeUnknownSync(ClientCapabilities)({
      roots: { listChanged: true },
    });
    expect(decoded.roots?.listChanged).toBe(true);
  });
});

describe("InitializeRequest", () => {
  const valid = {
    method: "initialize" as const,
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  };

  it("round-trips an initialize request", () => {
    const encoded = Schema.encodeSync(InitializeRequest)(valid);
    expect(Schema.decodeUnknownSync(InitializeRequest)(encoded)).toEqual(valid);
  });

  it("requires protocolVersion", () => {
    expect(() =>
      Schema.decodeUnknownSync(InitializeRequest)({
        ...valid,
        params: { ...valid.params, protocolVersion: undefined as unknown as string },
      })
    ).toThrow();
  });

  it("requires clientInfo", () => {
    expect(() =>
      Schema.decodeUnknownSync(InitializeRequest)({
        ...valid,
        params: { ...valid.params, clientInfo: undefined as unknown as { name: string; version: string } },
      })
    ).toThrow();
  });
});

describe("InitializeResult", () => {
  const valid = {
    protocolVersion: "2024-11-05",
    capabilities: {},
    serverInfo: { name: "srv", version: "1.0.0" },
  };

  it("round-trips an initialize result", () => {
    const encoded = Schema.encodeSync(InitializeResult)(valid);
    expect(Schema.decodeUnknownSync(InitializeResult)(encoded)).toEqual(valid);
  });

  it("requires serverInfo", () => {
    expect(() =>
      Schema.decodeUnknownSync(InitializeResult)({
        ...valid,
        serverInfo: undefined as unknown as { name: string; version: string },
      })
    ).toThrow();
  });
});

describe("InitializedNotification", () => {
  it("round-trips an initialized notification", () => {
    const original = {
      method: "notifications/initialized" as const,
    };
    const encoded = Schema.encodeSync(InitializedNotification)(original);
    expect(Schema.decodeUnknownSync(InitializedNotification)(encoded)).toEqual(original);
  });
});

describe("PingRequest", () => {
  it("round-trips a ping request", () => {
    const original = { method: "ping" as const };
    const encoded = Schema.encodeSync(PingRequest)(original);
    expect(Schema.decodeUnknownSync(PingRequest)(encoded)).toEqual(original);
  });

  it("rejects non-ping methods", () => {
    expect(() =>
      Schema.decodeUnknownSync(PingRequest)({
        method: "other",
      })
    ).toThrow();
  });
});

describe("CancelledNotification", () => {
  it("round-trips a cancelled notification with reason", () => {
    const original = {
      method: "notifications/cancelled" as const,
      params: { requestId: 42, reason: "user abort" },
    };
    const encoded = Schema.encodeSync(CancelledNotification)(original);
    expect(Schema.decodeUnknownSync(CancelledNotification)(encoded)).toEqual(original);
  });

  it("round-trips a cancelled notification without reason", () => {
    const original = {
      method: "notifications/cancelled" as const,
      params: { requestId: 42 },
    };
    const encoded = Schema.encodeSync(CancelledNotification)(original);
    expect(Schema.decodeUnknownSync(CancelledNotification)(encoded)).toEqual(original);
  });

  it("requires requestId", () => {
    expect(() =>
      Schema.decodeUnknownSync(CancelledNotification)({
        method: "notifications/cancelled",
        params: {},
      })
    ).toThrow();
  });
});

describe("Progress", () => {
  it("requires progress", () => {
    expect(() => Schema.decodeUnknownSync(Progress)({})).toThrow();
  });

  it("decodes progress with optional total", () => {
    const decoded = Schema.decodeUnknownSync(Progress)({
      progress: 50,
      total: 100,
    });
    expect(decoded.progress).toBe(50);
    expect(decoded.total).toBe(100);
  });
});

describe("ProgressNotification", () => {
  it("round-trips a progress notification", () => {
    const original = {
      method: "notifications/progress" as const,
      params: { progressToken: "t1", progress: 50, total: 100 },
    };
    const encoded = Schema.encodeSync(ProgressNotification)(original);
    expect(Schema.decodeUnknownSync(ProgressNotification)(encoded)).toEqual(original);
  });
});

describe("PaginatedRequest", () => {
  it("round-trips with no params", () => {
    const original = {
      method: "resources/list" as const,
    };
    const encoded = Schema.encodeSync(PaginatedRequest)(original);
    expect(Schema.decodeUnknownSync(PaginatedRequest)(encoded)).toEqual(original);
  });

  it("round-trips with cursor", () => {
    const original = {
      method: "resources/list" as const,
      params: { cursor: "c1" },
    };
    const encoded = Schema.encodeSync(PaginatedRequest)(original);
    expect(Schema.decodeUnknownSync(PaginatedRequest)(encoded)).toEqual(original);
  });
});

describe("PaginatedResult", () => {
  it("decodes an empty paginated result", () => {
    const decoded = Schema.decodeUnknownSync(PaginatedResult)({});
    expect(decoded).toEqual({});
  });

  it("decodes with nextCursor", () => {
    const decoded = Schema.decodeUnknownSync(PaginatedResult)({
      nextCursor: "c2",
    });
    expect(decoded.nextCursor).toBe("c2");
  });
});

describe("LoggingLevel", () => {
  it("accepts each valid level", () => {
    for (const level of [
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ]) {
      expect(Schema.decodeUnknownSync(LoggingLevel)(level)).toBe(level);
    }
  });

  it("rejects unknown levels", () => {
    expect(() => Schema.decodeUnknownSync(LoggingLevel)("trace")).toThrow();
  });
});

describe("SetLevelRequest", () => {
  it("round-trips a set-level request", () => {
    const original = {
      method: "logging/setLevel" as const,
      params: { level: "debug" as const },
    };
    const encoded = Schema.encodeSync(SetLevelRequest)(original);
    expect(Schema.decodeUnknownSync(SetLevelRequest)(encoded)).toEqual(original);
  });
});

describe("LoggingMessageNotification", () => {
  it("round-trips a logging message notification", () => {
    const original = {
      method: "notifications/message" as const,
      params: { level: "error" as const, logger: "x", data: { msg: "boom" } },
    };
    const encoded = Schema.encodeSync(LoggingMessageNotification)(original);
    expect(Schema.decodeUnknownSync(LoggingMessageNotification)(encoded)).toEqual(original);
  });
});

describe("ListRootsRequest", () => {
  it("round-trips a list-roots request", () => {
    const original = {
      method: "roots/list" as const,
    };
    const encoded = Schema.encodeSync(ListRootsRequest)(original);
    expect(Schema.decodeUnknownSync(ListRootsRequest)(encoded)).toEqual(original);
  });
});

describe("ListRootsResult", () => {
  it("round-trips with one root", () => {
    const original = {
      roots: [{ uri: "file:///tmp", name: "tmp" }],
    };
    const encoded = Schema.encodeSync(ListRootsResult)(original);
    expect(Schema.decodeUnknownSync(ListRootsResult)(encoded)).toEqual(original);
  });

  it("rejects a non-file:// root uri", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListRootsResult)({
        roots: [{ uri: "http://example.com" }],
      })
    ).toThrow();
  });
});

describe("Root", () => {
  it("requires uri starting with file://", () => {
    expect(() =>
      Schema.decodeUnknownSync(Root)({ uri: "/tmp" })
    ).toThrow();
  });
});

describe("RootsListChangedNotification", () => {
  it("round-trips a roots-list-changed notification", () => {
    const original = {
      method: "notifications/roots/list_changed" as const,
    };
    const encoded = Schema.encodeSync(RootsListChangedNotification)(original);
    expect(Schema.decodeUnknownSync(RootsListChangedNotification)(encoded)).toEqual(original);
  });
});
