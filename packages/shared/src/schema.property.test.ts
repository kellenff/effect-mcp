import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Schema from "effect/Schema";
import {
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  RequestId,
} from "./schema.js";

const requestIdArbitrary = fc.oneof(
  fc.string(),
  fc.integer()
);

const messageArbitrary = requestIdArbitrary.chain((id) =>
  fc.oneof(
    fc.string().map((method) => ({
      jsonrpc: "2.0" as const,
      id,
      method,
    })),
    fc.string().map((method) => ({
      jsonrpc: "2.0" as const,
      method,
    })),
    fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue()).map((result) => ({
      jsonrpc: "2.0" as const,
      id,
      result,
    })),
    fc.record({
      code: fc.integer(),
      message: fc.string(),
      data: fc.option(fc.jsonValue(), { nil: undefined }),
    }).map((error) => ({
      jsonrpc: "2.0" as const,
      id,
      error,
    }))
  )
);

describe("schema properties", () => {
  it("round-trips every generated request id", () => {
    fc.assert(
      fc.property(requestIdArbitrary, (id) => {
        const encoded = Schema.encodeSync(RequestId)(id);
        expect(Schema.decodeUnknownSync(RequestId)(encoded)).toBe(id);
      })
    );
  });

  it("round-trips every generated JSON-RPC message", () => {
    fc.assert(
      fc.property(messageArbitrary, (message) => {
        const decoded = Schema.decodeUnknownSync(JSONRPCMessage)(message);
        expect(decoded).toEqual(message);
      })
    );
  });

  it("preserves each envelope when encoded and decoded", () => {
    fc.assert(
      fc.property(requestIdArbitrary, fc.string(), (id, method) => {
        const request = { jsonrpc: "2.0" as const, id, method };
        const notification = { jsonrpc: "2.0" as const, method };
        const response = { jsonrpc: "2.0" as const, id, result: {} };
        const error = { jsonrpc: "2.0" as const, id, error: { code: 1, message: method } };

        expect(Schema.decodeUnknownSync(JSONRPCRequest)(Schema.encodeSync(JSONRPCRequest)(request))).toEqual(request);
        expect(Schema.decodeUnknownSync(JSONRPCNotification)(Schema.encodeSync(JSONRPCNotification)(notification))).toEqual(notification);
        expect(Schema.decodeUnknownSync(JSONRPCResponse)(Schema.encodeSync(JSONRPCResponse)(response))).toEqual(response);
        expect(Schema.decodeUnknownSync(JSONRPCError)(Schema.encodeSync(JSONRPCError)(error))).toEqual(error);
      })
    );
  });
});
