import { bench, describe } from "vitest";
import { JsonRpcError, JSONRPCMessage, RequestId, Result } from "@effect-mcp/shared";
import { Messenger } from "./messenger.js";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as LogLevel from "effect/LogLevel";
import * as Logger from "effect/Logger";
import * as Mailbox from "effect/Mailbox";
import * as PubSub from "effect/PubSub";

/**
 * Shared bench fixtures used by every `Messenger.send*` benchmark
 * below.
 *
 * Keeping them at module scope avoids recreating the same
 * `RequestId` / `Result` / `JsonRpcError` on every iteration —
 * important because micro-benchmarks are sensitive to noise and
 * construction overhead would otherwise dominate the measured
 * work.
 *
 *   - `id`     — stable `RequestId("1")`, reused across every bench
 *                so the outbound envelope stays consistent. The
 *                cost measured is the `Messenger.send*` plumbing,
 *                not id generation / UUID v4 entropy.
 *   - `result` — minimal valid `Result` (just an `_meta.pong`
 *                flag). Chosen because it exercises the schema's
 *                envelope without dragging in heavier
 *                `CallToolResult` / `ListToolsResult` semantics,
 *                which would skew the comparison toward encoding
 *                cost rather than `Messenger.send*` plumbing.
 *   - `error`  — pre-baked `InternalError` JSON-RPC error so the
 *                error-path bench doesn't repeatedly call
 *                `JsonRpcError.fromCode` (the construction itself
 *                has cost worth excluding from the hot path).
 */
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

/**
 * Creates a scoped effect that provides a mailbox for JSON-RPC messages to the given program.
 * The mailbox is automatically cleaned up when the effect scope ends.
 *
 * @param program - A function that takes a mailbox and returns an effect
 * @returns An effect that runs the program with the provided mailbox
 */
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

/**
 * Creates a JSON-RPC message with a sequential ID and pong result.
 *
 * This function generates a JSON-RPC 2.0 compliant message object containing
 * a unique request identifier and a result payload indicating a pong response.
 * The message follows the JSON-RPC 2.0 specification with a meta object
 * containing pong confirmation.
 *
 * @param i - Numeric identifier to be converted to string and used as request ID
 * @returns JSON-RPC message object with id, jsonrpc version, and result payload
 */
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

/**
 * Raw-PubSub throughput bench — baseline for the
 * `Messenger` / `Mailbox` benches elsewhere in this file.
 *
 * Sets up a `PubSub.bounded<JSONRPCMessage>(1000)`, forks a
 * single consumer fiber, publishes 100 messages from the
 * main fiber, and joins the consumer to bound the bench's
 * wall-clock duration.
 *
 * The bench exists to answer one question: how fast does
 * the underlying pub/sub primitive move messages between
 * fibers? The Messenger + Mailbox benches wrap this
 * primitive; the ratio between their numbers and this one
 * reveals the cost of that wrapping (mailbox dispatching,
 * schema encoding, structured-concurrency bookkeeping,
 * etc.).
 *
 * Key parameters:
 *   - **Bounded capacity = 1000** — large enough that the
 *     producer never blocks on `publish` during this bench
 *     (100 messages × 1 producer << 1000), so the
 *     measurement reflects pure pub/sub cost without
 *     backpressure artifacts. Compare to the
 *     `Mailbox (client outbound) > 100 offer` bench
 *     further down which exercises the backpressure path.
 *   - **Consumer retry on empty batch** — the inner loop's
 *     `if (messages.length === 0) i--;` is the consumer's
 *     way of saying "this take returned no work, don't
 *     count it as progress". A bounded PubSub may yield
 *     empty batches when the producer hasn't caught up,
 *     and we want to measure 100 *actual* messages
 *     consumed, not 100 takes.
 *   - **Effect.fork + Fiber.join** — the consumer runs on
 *     a sibling fiber so it can drain the queue while the
 *     producer is publishing. Joining at the end guarantees
 *     the consumer observed all 100 messages before the
 *     bench scope exits, which keeps the bench duration
 *     deterministic.
 *
 * Uses the **raw** `PubSub.bounded` primitive, not the
 * Messenger or Mailbox wrappers — by design, this is the
 * floor that the higher-level benches are measured
 * against.
 */
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
