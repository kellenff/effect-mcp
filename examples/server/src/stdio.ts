#!/usr/bin/env node

import { StdioServerTransport } from "@effect-mcp/server";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { ServerLive } from "./shared.js";

const AppLive = Layer.provideMerge(ServerLive, NodeContext.layer).pipe(
  Layer.provideMerge(Layer.scope)
);

StdioServerTransport.make.pipe(Effect.provide(AppLive), NodeRuntime.runMain);
