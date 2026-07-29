import { describe, it, expect, vi } from "vitest";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import { handleMessage, MCP } from "./mcp.js";
import type { JSONRPCMessage } from "./schema.js";

const makeMockService = () => {
  const calls: Array<{ kind: string; msg: unknown }> = [];
  const tag =
    <K extends string>(kind: K) =>
    (msg: unknown): Effect.Effect<void> => {
      calls.push({ kind, msg });
      return Effect.void;
    };
  return {
    service: {
      handleError: vi.fn().mockImplementation(tag("handleError")),
      handleResponse: vi.fn().mockImplementation(tag("handleResponse")),
      handleRequest: vi.fn().mockImplementation(tag("handleRequest")),
      handleNotification: vi.fn().mockImplementation(tag("handleNotification")),
    },
    calls,
  };
};

const dispatch = (message: JSONRPCMessage, service: MCP.Service) =>
  Effect.runSync(
    pipe(handleMessage(message), Effect.provideService(MCP, service))
  );

const req = (id: number | string) => ({
  jsonrpc: "2.0" as const,
  id,
  method: "ping",
});

const notif = () => ({
  jsonrpc: "2.0" as const,
  method: "notifications/initialized",
});

const resp = (id: number | string) => ({
  jsonrpc: "2.0" as const,
  id,
  result: {},
});

const err = (id: number | string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code: -32600, message: "invalid" },
});

const only = (service: ReturnType<typeof makeMockService>["service"], kind: keyof typeof service) => {
  for (const k of Object.keys(service) as Array<keyof typeof service>) {
    if (k !== kind) expect(service[k]).not.toHaveBeenCalled();
  }
  expect(service[kind]).toHaveBeenCalledTimes(1);
};

describe("handleMessage", () => {
  it("dispatches messages with an error field to handleError (priority over id/result)", () => {
    const { service } = makeMockService();
    dispatch(err(1) as unknown as JSONRPCMessage, service);
    only(service, "handleError");
  });

  it("dispatches messages with a result field to handleResponse (priority over id)", () => {
    const { service } = makeMockService();
    dispatch(resp(1) as unknown as JSONRPCMessage, service);
    only(service, "handleResponse");
  });

  it("dispatches messages with id (and no result/error) to handleRequest", () => {
    const { service } = makeMockService();
    dispatch(req(1) as unknown as JSONRPCMessage, service);
    only(service, "handleRequest");
  });

  it("dispatches messages without id to handleNotification (orElse fallback)", () => {
    const { service } = makeMockService();
    dispatch(notif() as unknown as JSONRPCMessage, service);
    only(service, "handleNotification");
  });

  it("treats { error: null } as present and dispatches to handleError", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, error: null } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleError");
  });

  it("treats { result: null } as present and dispatches to handleResponse", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, result: null } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleResponse");
  });

  it("treats a non-object result string as not-present, falling through to handleRequest", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, result: "string" } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleRequest");
  });

  it("treats a non-object error string as not-present, falling through to handleRequest", () => {
    const { service } = makeMockService();
    dispatch(
      { jsonrpc: "2.0", id: 1, error: "string" } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleRequest");
  });

  it("prioritizes error over result when both are present", () => {
    const { service } = makeMockService();
    dispatch(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {},
        error: { code: -32600, message: "invalid" },
      } as unknown as JSONRPCMessage,
      service
    );
    only(service, "handleError");
  });

  it("passes the original message to the chosen handler", () => {
    const { service } = makeMockService();
    const message = req(7);
    dispatch(message as unknown as JSONRPCMessage, service);
    expect(service.handleRequest).toHaveBeenCalledWith(message);
  });
});
