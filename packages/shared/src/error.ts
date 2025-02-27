import * as Schema from "effect/Schema";

export const JsonRpcErrorCode = {
  // SDK error codes
  ConnectionClosed: -32000,
  RequestTimeout: -32001,

  // Standard JSON-RPC error codes
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export class JsonRpcError extends Schema.TaggedError<JsonRpcError>()(
  "JsonRpcError",
  {
    code: Schema.Number,
    message: Schema.String,
    data: Schema.optional(Schema.Unknown),
  }
) {
  static readonly fromCode = (
    cause: keyof typeof JsonRpcErrorCode,
    message: string,
    data?: unknown
  ) =>
    new JsonRpcError({
      code: JsonRpcErrorCode[cause],
      message: message,
      data: data,
    });
}
