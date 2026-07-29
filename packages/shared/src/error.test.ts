import { describe, it, expect } from "vitest";
import * as Schema from "effect/Schema";
import { JsonRpcError, JsonRpcErrorCode } from "./error.js";

describe("JsonRpcErrorCode", () => {
  it("exposes the JSON-RPC 2.0 standard codes", () => {
    expect(JsonRpcErrorCode.ParseError).toBe(-32700);
    expect(JsonRpcErrorCode.InvalidRequest).toBe(-32600);
    expect(JsonRpcErrorCode.MethodNotFound).toBe(-32601);
    expect(JsonRpcErrorCode.InvalidParams).toBe(-32602);
    expect(JsonRpcErrorCode.InternalError).toBe(-32603);
  });

  it("exposes SDK-defined codes", () => {
    expect(JsonRpcErrorCode.ConnectionClosed).toBe(-32000);
    expect(JsonRpcErrorCode.RequestTimeout).toBe(-32001);
  });
});

describe("JsonRpcError", () => {
  it("constructs with code/message/data and preserves fields", () => {
    const e = new JsonRpcError({
      code: -32000,
      message: "closed",
      data: { reason: "timeout" },
    });
    expect(e.code).toBe(-32000);
    expect(e.message).toBe("closed");
    expect(e.data).toEqual({ reason: "timeout" });
  });

  it("fromCode maps enum key to numeric", () => {
    const e = JsonRpcError.fromCode("ParseError", "bad json");
    expect(e.code).toBe(-32700);
    expect(e.message).toBe("bad json");
  });

  it("fromCode accepts optional data", () => {
    const e = JsonRpcError.fromCode("InternalError", "oops", { detail: 1 });
    expect(e.data).toEqual({ detail: 1 });
  });

  it("fromCode omits data when not provided", () => {
    const e = JsonRpcError.fromCode("InternalError", "oops");
    expect(e.data).toBeUndefined();
  });

  it("round-trips through Schema encode/decode", () => {
    const original = JsonRpcError.fromCode("InvalidParams", "x", { y: 1 });
    const encoded = Schema.encodeSync(JsonRpcError)(original);
    const decoded = Schema.decodeUnknownSync(JsonRpcError)(encoded);
    expect(decoded).toEqual(original);
  });
});
