import { JsonRpcError, RequestId, ServerResult } from "@effect-mcp/shared";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

/**
 * A context tag representing a deferred map used in JSON-RPC server implementations.
 * This class extends Context.Tag and provides a structured way to manage pending requests
 * through a Ref containing a HashMap mapping RequestId to Deferred effects.
 *
 * The deferred map holds references to pending JSON-RPC requests, allowing for asynchronous
 * handling and resolution of server responses. Each entry in the map corresponds to a
 * request that is awaiting completion, with the Deferred effect representing the eventual
 * result or error of that request.
 *
 * This implementation facilitates concurrent request handling by providing thread-safe
 * access to the pending requests map through the Ref abstraction.
 */
export class DeferredMap extends Context.Tag("DeferredMap")<
  DeferredMap,
  Ref.Ref<
    HashMap.HashMap<RequestId, Deferred.Deferred<ServerResult, JsonRpcError>>
  >
>() {
  /**
   * Represents an empty layer effect that initializes a Ref containing an empty HashMap.
   * The Ref holds a mapping of RequestId to Deferred effects for ServerResult and JsonRpcError types.
   * This structure is used for managing pending requests in a JsonRpc server implementation.
   */
  static Empty = Layer.effect(
    DeferredMap,
    Ref.make(
      HashMap.empty<RequestId, Deferred.Deferred<ServerResult, JsonRpcError>>()
    )
  );
}
