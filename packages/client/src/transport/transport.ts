import {
  JsonRpcError,
  JSONRPCMessage,
  Notification,
  Request,
  RequestId,
  ServerResult,
} from "@effect-mcp/shared";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Mailbox from "effect/Mailbox";
import * as Ref from "effect/Ref";

/**
 * Namespace containing transport-related types and interfaces for JSON-RPC communication.
 */
export declare namespace Transport {
  /**
   * Represents a service that handles JSON-RPC communication over a mailbox.
   * Provides methods for sending requests, notifications, errors and results,
   * as well as managing the service lifecycle through a close effect.
   * The service receives inbound messages through a mailbox.
   */
  export type Service = {
    inbound: Mailbox.Mailbox<JSONRPCMessage>;
    close: Effect.Effect<void>;
    sendRequest: (
      id: RequestId,
      request: Request
    ) => Effect.Effect<void>;
    sendNotification: (notification: Notification) => Effect.Effect<void>;
    sendError: (id: RequestId, error: JsonRpcError) => Effect.Effect<void>;
    sendResult: (id: RequestId, result: ServerResult) => Effect.Effect<void>;
  };
}

/**
 * Represents a transport mechanism for sending and receiving data across different contexts.
 * This class extends Context.Tag to provide a tagged transport service that can be used
 * for communication between various system components. The transport handles the underlying
 * mechanics of data transmission while providing a consistent interface for message passing.
 * It serves as a foundational component for building distributed systems and inter-context
 * communication patterns.
 */
export class Transport extends Context.Tag("Transport")<
  Transport,
  Transport.Service
>() {}
