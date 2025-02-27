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

export declare namespace Transport {
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

export class Transport extends Context.Tag("Transport")<
  Transport,
  Transport.Service
>() {}
