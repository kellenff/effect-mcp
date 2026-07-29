import * as Context from "effect/Context";
import * as HashMap from "effect/HashMap";
import * as Inspectable from "effect/Inspectable";
import * as Layer from "effect/Layer";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Prompt from "./prompt.js";

/**
 * A unique symbol used as a type identifier for PromptKit instances.
 * This symbol serves as a brand or tag to distinguish PromptKit types
 * within the effect-mcp/server framework.
 */
export const TypeId: unique symbol = Symbol.for("@effect-mcp/server/PromptKit");

/**
 * TypeId represents a unique identifier for a specific type within the application.
 * This type is used to distinguish between different types at runtime and enable
 * type-safe operations based on these identifiers. The TypeId is typically used
 * in conjunction with reflection-like capabilities or type registry patterns where
 * types need to be identified, compared, or looked up dynamically. It ensures that
 * each distinct type has a consistent and unique representation throughout the system,
 * facilitating reliable type checking and dispatching mechanisms without relying solely
 * on constructor names or instanceof checks which may be insufficient in certain scenarios
 * such as when dealing with minified code or complex inheritance hierarchies.
 */
export type TypeId = typeof TypeId;

/**
 * Represents a registry for managing prompts in the server environment.
 * Extends Context.Tag to provide a tagged service for dependency injection.
 * The registry stores prompts mapped by their string identifiers using a HashMap structure.
 * Provides a Live layer implementation for initializing an empty registry.
 */
export class Registry extends Context.Tag(
  "@effect-mcp/server/PromptKit/Registry"
)<Registry, HashMap.HashMap<string, Prompt.Prompt.Any>>() {
  static readonly Live: Layer.Layer<Registry> = Layer.sync(Registry, () =>
    HashMap.empty()
  );
}

/**
 * A PromptKit is a collection of prompts that can be composed and manipulated.
 * It provides methods to add new prompts, combine with other PromptKits, and
 * finalize the collection into a Layer for execution.
 *
 * PromptKit instances are immutable and all operations return new instances
 * rather than modifying the existing one.
 *
 * The type parameters represent:
 * - Prompts: Union of all prompt types contained in this kit
 * - R: Combined context requirements of all prompts in the kit
 */
export interface PromptKit<in out Prompts extends Prompt.Prompt.Any, R>
  extends Inspectable.Inspectable,
    Pipeable {
  readonly [TypeId]: TypeId;
  readonly prompts: HashMap.HashMap<string, Prompt.Prompt.Any>;
  readonly add: <S extends Prompt.Prompt.Any>(
    prompt: S
  ) => PromptKit<Prompts | S, R | Prompt.Prompt.Context<S>>;
  readonly addAll: <ToAdd extends ReadonlyArray<Prompt.Prompt.Any>>(
    ...prompts: ToAdd
  ) => PromptKit<
    Prompts | ToAdd[number],
    R | Prompt.Prompt.Context<ToAdd[number]>
  >;
  readonly concat: <P extends Prompt.Prompt.Any>(
    that: PromptKit<P, R>
  ) => PromptKit<Prompts | P, R | Prompt.Prompt.Context<P>>;
  readonly finalize: () => Layer.Layer<Registry, R>;
}

/**
 * Default in-memory implementation of the `PromptKit` interface.
 *
 * Stores registered prompts in a `HashMap` keyed by `prompt.name`
 * and provides a fluent builder API (`add`, `addAll`, `concat`)
 * for assembling a prompt registry before sealing it into a
 * consumable `Layer` via `finalize()`.
 *
 * Instances are produced either directly through the constructor
 * (typically by `PromptKit.empty()` or similar factory) or, more
 * commonly, by chaining off an existing kit. Every mutating
 * method returns a *new* `PromptKitImpl` — the original is never
 * modified, which keeps the builder pipeline referentially
 * transparent and safe to share.
 *
 * @template Prompts A union of every prompt type currently
 *                  registered in the kit. Widened automatically
 *                  by `add`, `addAll`, and `concat` so downstream
 *                  `prompts/get` handlers can reference registered
 *                  prompts by name without casts.
 * @template R      A union of every `Prompt.Context` contributed
 *                  by registered prompts. Represents the service
 *                  requirements that `finalize()` will surface on
 *                  the produced layer.
 */
class PromptKitImpl<Prompts extends Prompt.Prompt.Any, R>
  implements PromptKit<Prompts, R>
{
  readonly [TypeId]: TypeId;
  constructor(readonly prompts: HashMap.HashMap<string, Prompt.Prompt.Any>) {
    this[TypeId] = TypeId;
  }

  /**
   * Converts the current instance to a JSON-compatible object representation.
   * The resulting object contains the identifier and an array of prompt names.
   * @return {unknown} An object with _id field set to "@effect-mcp/server/PromptKit" and prompts field containing an array of prompt names
   */
  toJSON(): unknown {
    return {
      _id: "@effect-mcp/server/PromptKit",
      prompts: [...HashMap.values(this.prompts)].map((prompt) => prompt.name),
    };
  }
  toString(): string {
    return Inspectable.format(this);
  }
  [Inspectable.NodeInspectSymbol](): string {
    return Inspectable.format(this);
  }

  pipe() {
    return pipeArguments(this, arguments);
  }

  /**
   * Adds a new prompt to the prompt kit collection.
   * @param prompt - The prompt to add to the collection
   * @return A new PromptKit instance with the added prompt included in the prompts union type and its context type included in the result union type
   */
  add<S extends Prompt.Prompt.Any>(
    prompt: S
  ): PromptKit<Prompts | S, R | Prompt.Prompt.Context<S>> {
    return new PromptKitImpl<Prompts | S, R | Prompt.Prompt.Context<S>>(
      HashMap.set(this.prompts, prompt.name, prompt)
    );
  }

  /**
   * Adds multiple prompts to the current PromptKit instance.
   * @param prompts - The prompts to add to the current instance.
   * @return A new PromptKit instance containing all prompts from the current instance plus the added prompts.
   */
  addAll<ToAdd extends ReadonlyArray<Prompt.Prompt.Any>>(
    ...prompts: ToAdd
  ): PromptKit<
    Prompts | ToAdd[number],
    R | Prompt.Prompt.Context<ToAdd[number]>
  > {
    let map = this.prompts;

    for (const prompt of prompts) {
      map = HashMap.set(map, prompt.name, prompt);
    }

    return new PromptKitImpl<
      Prompts | ToAdd[number],
      R | Prompt.Prompt.Context<ToAdd[number]>
    >(map);
  }

  /**
   * Combines two PromptKit instances into a single PromptKit containing all prompts from both.
   * @param that - The PromptKit instance to concatenate with this instance
   * @return A new PromptKit instance containing the union of prompts from both instances
   */
  concat<P extends Prompt.Prompt.Any>(
    that: PromptKit<P, R>
  ): PromptKit<Prompts | P, R | Prompt.Prompt.Context<P>> {
    return new PromptKitImpl<Prompts | P, R | Prompt.Prompt.Context<P>>(
      HashMap.union(this.prompts, that.prompts)
    );
  }

  /**
   * Finalizes the layer by creating a new layer that succeeds with the current prompts registry.
   * This method wraps the current prompts instance in a layer that can be used for dependency injection.
   * @return A new layer containing the prompts registry
   */
  finalize(): Layer.Layer<Registry, R> {
    return Layer.succeed(Registry, this.prompts);
  }
}

/**
 * Represents an empty prompt kit instance that contains no prompts or responses.
 * This constant provides a default implementation with no initial state or values.
 * The type parameters are set to 'never' indicating this instance will not produce
 * any prompt or response values.
 */
export const empty: PromptKit<never, never> = new PromptKitImpl<never, never>(
  HashMap.empty()
);
