import {
  JsonRpcError,
  JSONRPCMessage,
  Notification,
  Request,
  RequestId,
  Result,
} from "@effect-mcp/shared";
import * as Mailbox from "effect/Mailbox";
import * as Effect from "effect/Effect";

export class Messenger extends Effect.Service<Messenger>()(
  "@effect-mcp/server/Messenger",
  {
    effect: Effect.gen(function* () {
      const outbound = yield* Mailbox.make<JSONRPCMessage>();

      const sendResult = Effect.fn("SendResult")(function* (
        id: RequestId,
        result: Result
      ) {
        yield* Effect.log(`Sending result:`, result);
        yield* outbound.offer({
          jsonrpc: "2.0",
          id: id,
          result: result,
        });
      });

      const sendError = Effect.fn("SendError")(function* (
        id: RequestId,
        error: JsonRpcError
      ) {
        yield* Effect.log(`Sending error:`, error);
        yield* outbound.offer({
          jsonrpc: "2.0",
          id: id,
          error: error,
        });
      });

      const sendNotification = Effect.fn("SendNotification")(function* (
        notification: Notification
      ) {
        yield* Effect.log(`Sending notification:`, notification);
        yield* outbound.offer({
          jsonrpc: "2.0",
          method: notification.method,
          params: notification.params,
        });
      });

      const sendRequest = Effect.fn("SendRequest")(function* (
        id: RequestId,
        request: Request
      ) {
        yield* Effect.log(`Sending request:`, request);
        yield* outbound.offer({
          jsonrpc: "2.0",
          id: id,
          method: request.method,
          params: request.params,
        });
      });

      return {
        outbound,
        sendResult,
        sendError,
        sendNotification,
        sendRequest,
      };
    }),
  }
) {}
