import type { ServerNotification } from "@effect-mcp/shared";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";

/**
 * A service for managing MCP notifications.
 *
 * This service provides a pub/sub mechanism for server notifications with a bounded buffer capacity of 100 notifications.
 * It exposes a notification stream that consumers can subscribe to and a notify function for publishing notifications.
 *
 * The service maintains an internal PubSub instance for handling notification distribution.
 * When the buffer reaches its capacity limit, new notifications may block until space becomes available.
 *
 * Notifications published through this service are distributed to all current subscribers.
 * The service ensures thread-safe publication and subscription handling.
 */
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
