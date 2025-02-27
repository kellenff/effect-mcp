import { JsonRpcError, RequestId, ServerResult } from "@effect-mcp/shared";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

export class DeferredMap extends Context.Tag("DeferredMap")<
  DeferredMap,
  Ref.Ref<
    HashMap.HashMap<RequestId, Deferred.Deferred<ServerResult, JsonRpcError>>
  >
>() {
  static Empty = Layer.effect(
    DeferredMap,
    Ref.make(
      HashMap.empty<RequestId, Deferred.Deferred<ServerResult, JsonRpcError>>()
    )
  );
}
