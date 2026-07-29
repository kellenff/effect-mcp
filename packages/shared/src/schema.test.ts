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
