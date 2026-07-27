import { bench, describe } from "vitest";
import { JsonRpcError, JSONRPCMessage, RequestId, Result } from "@effect-mcp/shared";
import { Messenger } from "./messenger.js";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as LogLevel from "effect/LogLevel";
import * as Logger from "effect/Logger";
import * as Mailbox from "effect/Mailbox";
import * as PubSub from "effect/PubSub";

const id = RequestId.make("1");
const result: Result = { _meta: { pong: true } };
const error = JsonRpcError.fromCode("InternalError", "boom");

const withMessenger = <A, E>(
  program: (m: typeof Messenger.Service) => Effect.Effect<A, E, never>
): Effect.Effect<A, E, never> =>
  Effect.scoped(
    Effect.gen(function* () {
      const messenger = yield* Messenger;
      return yield* program(messenger);
    })
  ).pipe(
    Effect.provide(Messenger.Default),
    Logger.withMinimumLogLevel(LogLevel.None)
  );

const withMailbox = <A, E>(
  program: (
    mailbox: Mailbox.Mailbox<JSONRPCMessage>
  ) => Effect.Effect<A, E, never>
): Effect.Effect<A, E, never> =>
  Effect.scoped(
    Effect.gen(function* () {
      const mailbox = yield* Mailbox.make<JSONRPCMessage>();
      return yield* program(mailbox);
    })
  );

const makeMessage = (i: number) =>
  ({
    jsonrpc: "2.0" as const,
    id: RequestId.make(String(i)),
    result: { _meta: { pong: true } },
  }) satisfies JSONRPCMessage;

describe("Messenger.sendResult", () => {
  bench("publish one result", async () => {
    await Effect.runPromise(
      withMessenger((m) => m.sendResult(id, result))
    );
  });
});

describe("Messenger.sendError", () => {
  bench("publish one error", async () => {
    await Effect.runPromise(
      withMessenger((m) => m.sendError(id, error))
    );
  });
});

describe("Messenger.sendNotification", () => {
  bench("publish one notification", async () => {
    await Effect.runPromise(
      withMessenger((m) =>
        m.sendNotification({
          method: "notifications/cancelled",
          params: { requestId: id, reason: "test" },
        })
      )
    );
  });
});

describe("Messenger.sendRequest", () => {
  bench("publish one request", async () => {
    await Effect.runPromise(
      withMessenger((m) =>
        m.sendRequest(id, {
          method: "ping",
          params: undefined,
        })
      )
    );
  });
});

describe("PubSub throughput (no consumer)", () => {
  bench("bounded(1000): 100 publish", async () => {
    await Effect.runPromise(
      withFreshPubSub(1000, (ps) =>
        Effect.gen(function* () {
          for (let i = 0; i < 100; i++) {
            yield* PubSub.publish(ps, makeMessage(i));
          }
        })
      )
    );
  });

  bench("unbounded: 100 publish", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ps = yield* PubSub.unbounded<JSONRPCMessage>();
          for (let i = 0; i < 100; i++) {
            yield* PubSub.publish(ps, makeMessage(i));
          }
        })
      )
    );
  });
});

describe("PubSub throughput (producer + consumer concurrently)", () => {
  bench("100 publish with one consumer", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ps = yield* PubSub.bounded<JSONRPCMessage>(1000);
          const consumer = yield* Effect.gen(function* () {
            for (let i = 0; i < 100; i++) {
              const [messages] = yield* ps;
              if (messages.length === 0) i--;
            }
          }).pipe(Effect.fork);

          for (let i = 0; i < 100; i++) {
            yield* PubSub.publish(ps, makeMessage(i));
          }
          yield* Fiber.join(consumer);
        })
      )
    );
  });
});

describe("Mailbox (client outbound)", () => {
  bench("100 offer", async () => {
    await Effect.runPromise(
      withMailbox((mb) =>
        Effect.gen(function* () {
          for (let i = 0; i < 100; i++) {
            yield* mb.offer(makeMessage(i));
          }
        })
      )
    );
  });

  bench("100 offer + 100 take", async () => {
    await Effect.runPromise(
      withMailbox((mb) =>
        Effect.gen(function* () {
          const consumerFiber = yield* Effect.gen(function* () {
            let count = 0;
            while (count < 100) {
              const [messages] = yield* mb;
              count += messages.length;
            }
          }).pipe(Effect.fork);

          for (let i = 0; i < 100; i++) {
            yield* mb.offer(makeMessage(i));
          }
          yield* Fiber.join(consumerFiber);
        })
      )
    );
  });
});
