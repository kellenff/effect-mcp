import type { ServerNotification } from "@effect-mcp/shared";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";

export class McpNotificationService extends Effect.Service<McpNotificationService>()(
  "@effect-mcp/client/McpNotificationService",
  {
    effect: Effect.gen(function* () {
      const notifications = yield* PubSub.bounded<ServerNotification>(100);

      const notify = Effect.fn("Notify")(function* (
        notification: ServerNotification
      ) {
        yield* notifications.publish(notification);
      });

      return {
        notifications,
        notify,
      };
    }),
  }
) {}
