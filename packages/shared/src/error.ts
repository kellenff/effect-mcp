import * as Schema from "effect/Schema";

/**
 * Constant object representing standard JSON-RPC 2.0 error codes along with
 * SDK-specific error codes. The numeric values are negative integers as
 * reserved by the JSON-RPC 2.0 specification for server-defined and
 * pre-defined errors. Codes in the range -32768 to -32000 are reserved for
 * pre-defined errors defined by the specification, while the SDK reserves
 * additional codes for connection and timeout related failures.
 *
 * @type {Readonly<{[key: string]: number}>}
 */
export const JsonRpcErrorCode = {
  // SDK error codes
  /**
   * Error code indicating that the connection has been closed.
   * This constant represents a specific error condition where an operation
   * cannot be completed because the underlying connection is no longer active.
   * @type {number}
   */
  ConnectionClosed: -32000,
  /**
   * Error code indicating that a request has timed out.
   * This constant represents a specific error condition where an operation
   * did not complete within the expected time frame.
   * @type {number}
   */
  RequestTimeout: -32001,

  // Standard JSON-RPC error codes
  /**
   * ParseError: -32700
   *
   * Error code indicating that invalid JSON was received by the server.
   * This error code is used when the JSON sent from the client cannot be parsed properly.
   * It represents a fundamental parsing failure at the transport layer.
   */
  ParseError: -32700,
  /**
   * Error code representing an invalid request.
   * This error is returned when the request is malformed or does not conform to the expected format.
   * The error code -32600 corresponds to the JSON-RPC 2.0 specification for invalid requests.
   */
  InvalidRequest: -32600,
  /**
   * Error code indicating that the requested method was not found.
   * This error is returned when a client attempts to call a method that does not exist on the server.
   * The error code follows the JSON-RPC 2.0 specification for method not found errors.
   */
  MethodNotFound: -32601,
  /**
   * InvalidParams: -32602
   *
   * Error code indicating that the parameters provided to a method are invalid.
   * This error should be returned when the server receives parameters that are
   * malformed, missing required fields, or contain values that are outside of
   * the acceptable range or format.
   *
   * This follows the JSON-RPC 2.0 error code specification where -32602
   * represents invalid method parameter(s).
   */
  InvalidParams: -32602,
  /**
   * InternalError: -32603
   *
   * Represents an internal error that occurred during the execution of a remote procedure call.
   * This error code indicates that something went wrong on the server side while processing the request.
   * The error is part of the JSON-RPC 2.0 specification error codes.
   *
   * This constant is typically used as the code property in an error response object when an
   * unexpected condition was encountered and no more specific message is suitable.
   *
   * The negative value -32603 is the standard reserved code for internal errors in JSON-RPC 2.0.
   */
  InternalError: -32603,
} as const;

/**
 * Represents a JSON-RPC error response object that conforms to the JSON-RPC 2.0 specification.
 * This error class includes a code, message, and optional data field to provide detailed error information.
 * The error codes follow the JSON-RPC 2.0 standard where:
 * -1 through -32768 are reserved for pre-defined errors
 * -32700: Parse error
 * -32600: Invalid Request
 * -32601: Method not found
 * -32602: Invalid params
 * -32603: Internal error
 * Codes -32000 through -32099 are reserved for implementation-defined server errors
 */
export class JsonRpcError extends Schema.TaggedError<JsonRpcError>()(
  "JsonRpcError",
  {
    code: Schema.Number,
    message: Schema.String,
    data: Schema.optional(Schema.Unknown),
  }
) {
  /**
   * Creates a new JsonRpcError instance from a specified error cause, message, and optional data.
   * The error code is determined by looking up the cause in the JsonRpcErrorCode enumeration.
   *
   * @param cause - The error cause key from JsonRpcErrorCode enumeration
   * @param message - The error message string
   * @param data - Optional additional error data
   * @returns A new JsonRpcError instance with the specified code, message, and data
   */
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
