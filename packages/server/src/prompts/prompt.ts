import type { JsonRpcError, PromptMessage } from "@effect-mcp/shared";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * A unique symbol used as a type identifier for Prompt instances.
 * This symbol serves as a nominal type tag to distinguish Prompt types
 * in the effect-mcp/server system.
 */
export const TypeId: unique symbol = Symbol.for("@effect-mcp/server/Prompt");

/**
 * TypeId represents a unique identifier for a specific type within the application.
 * This type is used to distinguish between different types at runtime and provides
 * a consistent way to reference and identify types across the system.
 * TypeId values are typically used for type checking, serialization, and deserialization
 * operations where type information needs to be preserved or compared.
 * The TypeId type ensures type safety by providing a standardized format for
 * type identification that can be used in discriminated unions and switch statements.
 */
export type TypeId = typeof TypeId;

/**
 * Represents a prompt that can be used to interactively collect input from a user.
 *
 * A Prompt is a specialized effect that takes structured input arguments and produces a result.
 * It encapsulates the logic for presenting questions or prompts to users and handling their responses.
 *
 * The Args type parameter defines the structure of the input arguments required by the prompt.
 * The R type parameter represents the result type that the prompt will produce upon completion.
 *
 * Prompts can be composed and combined to create complex interactive workflows.
 * They support various types of user input including text, choices, confirmations, and more.
 *
 * The prompt handles validation, error handling, and user interaction concerns internally.
 * It provides a declarative way to define interactive command-line interfaces.
 */
export type Prompt<Args extends Schema.Struct.Fields, R> = PromptEffect<
  Args,
  R
>; // TODO: Add others like dynamic, etc.

/**
 * Represents a prompt effect that handles structured input arguments and produces a sequence of prompt messages or JSON-RPC errors.
 * This interface extends the base prompt protocol and defines an effect-based handler for processing prompt interactions.
 * The handler function takes validated input arguments and returns an effect that may produce an array of prompt messages or a JSON-RPC error.
 *
 * @template Args - The schema fields defining the structure of input arguments
 * @template R - The environment requirements for the effect operation
 */
export interface PromptEffect<Args extends Schema.Struct.Fields, R>
  extends Prompt.Proto<Args> {
  readonly _tag: "Effect";
  readonly handler: (
    args: Schema.Struct.Type<Args>
  ) => Effect.Effect<readonly PromptMessage[], JsonRpcError, R>;
}

/**
 * Represents a dynamic prompt that can populate multiple prompt options based on a cursor.
 * This interface defines a prompt type that can dynamically generate prompt options
 * and handle user selections asynchronously.
 *
 * The populate method fetches a batch of prompt options with an optional cursor for pagination.
 * The handler method processes the selected prompt arguments and returns prompt messages.
 *
 * @template Args - The schema fields type for prompt arguments
 * @template R - The effect environment type
 * @property _tag - Discriminator tag identifying this as a Dynamic prompt type
 * @property populate - Function to populate prompt options, optionally using a cursor for pagination
 * @property handler - Function to handle selected prompt arguments and return prompt messages
 */
interface PromptDynamic<Args extends Schema.Struct.Fields, R> {
  readonly _tag: "Dynamic";
  readonly populate: (cursor?: string | undefined) => Effect.Effect<
    {
      prompts: ReadonlyArray<Prompt.Proto<Args>>;
      nextCursor?: string | undefined;
    },
    any,
    R
  >;
  readonly handler: (
    args: any
  ) => Effect.Effect<readonly PromptMessage[], JsonRpcError, R>;
}

/**
 * Namespace containing definitions related to prompts.
 *
 * @namespace Prompt
 */
export namespace Prompt {
  /**
   * Interface representing a protocol definition with typed arguments.
   *
   * A Proto defines the structure and metadata for a protocol, including its arguments schema,
   * description, and identifying information. It serves as a blueprint for protocol implementations
   * with compile-time type checking for the arguments.
   *
   * @template Args - The schema structure defining the protocol's argument types
   * @property _tag - String identifier for the protocol type
   * @property arguments - Schema definition for the protocol's arguments
   * @property description - Human-readable description of the protocol's purpose
   * @property name - Unique name identifier for the protocol
   */
  export interface Proto<Args extends Schema.Struct.Fields> {
    readonly [TypeId]: TypeId;
    readonly _tag: string;
    readonly arguments: Args;
    readonly description: string;
    readonly name: string;
  }

  /**
   * Represents a generic prompt interface that can handle any type of input and output.
   * This interface extends the base Prompt interface with flexible type parameters
   * to accommodate various prompt implementations and use cases.
   */
  export interface Any extends Prompt<any, any> {}

  /**
   * Extracts the resolved value type from a Prompt generic.
   *
   * Given a type parameter that extends Prompt, this conditional type
   * infers the second type argument of Prompt and returns it. If the
   * provided type does not extend Prompt, the result is never.
   */
  export type Context<P extends Prompt<any, any>> = P extends Prompt<
    infer _Args,
    infer R
  >
    ? R
    : never;
}

/**
 * Creates a prompt that executes an effect-based handler function.
 * The handler receives parsed arguments and returns an effect that produces prompt messages.
 *
 * @param params - Configuration object containing the prompt's metadata and argument schema
 * @param params.name - Unique identifier for the prompt
 * @param params.description - Human-readable description of what the prompt does
 * @param params.arguments - Schema defining the expected arguments for this prompt
 * @param handler - Function that processes the arguments and returns an effect producing prompt messages
 * @returns A prompt object that can be executed to produce structured responses
 */
export const effect = <Args extends Schema.Struct.Fields, R>(
  params: { name: string; description: string; arguments: Args },
  handler: (
    args: Schema.Struct.Type<Args>
  ) => Effect.Effect<readonly PromptMessage[], JsonRpcError, R>
): Prompt<Args, R> => ({
  _tag: "Effect",
  handler,
  arguments: params.arguments,
  description: params.description,
  name: params.name,
  [TypeId]: TypeId,
});
