import { ClassRegistry } from '@civ-clone/core-data-object/ClassRegistry';
import { DataObject } from '@civ-clone/core-data-object/DataObject';
/**
 * A reference to another saved entity. The only way the graph terminates:
 * `City._player` holds a `Player` whose `_civilization` holds a
 * `Civilization`, and `City._tile` reaches the `World` and through it every
 * tile. Inlining any of that either never terminates or writes the same data
 * hundreds of times.
 */
export type Ref = {
  $ref: string;
};
/** A class rather than an instance — `PlayerResearch._researching`. */
export type ClassRef = {
  $class: string;
};
/**
 * A rule held as state, recorded by class.
 *
 * `Unit._busy` is the only field in the engine that holds a `Rule` — measured
 * against a real game: 1,055 registered rules, 4,007 reachable entities, two
 * fields, both `<Unit>._busy`. A rule is a closure, so it cannot be written
 * out; what *can* be written is which one it is, because every `Busy` subclass
 * carries no instance state of its own. Anything that varies — when a delayed
 * action finishes, what finishing does — lives in a `PendingEffect`, which is
 * an ordinary saved entity.
 *
 * Rebuilt on load by `core-unit`'s `BusyRegistry`, which is why this is a
 * distinct marker rather than a `$class`: a class reference decodes to the
 * class, and what a unit needs back is an *instance*, built for it.
 */
export type BusyRef = {
  $busy: string;
};
export type EncodedMap = {
  $map: [unknown, unknown][];
};
export type EncodedSet = {
  $set: unknown[];
};
export type EncodeOptions = {
  /**
   * Called for every `DataObject` encountered. `save` uses it to discover
   * entities reachable from a saved one but not present in any registry —
   * `Spaceship._layout`, for instance — so they are written rather than
   * dangling as a `$ref` to nothing.
   */
  onEntity?: (entity: DataObject) => void;
  /** Field path, for the error message when something cannot be encoded. */
  path?: string;
};
export declare const encode: (
  value: unknown,
  options?: EncodeOptions
) => unknown;
export type DecodeContext = {
  /** id → the allocated instance, complete before any filling starts. */
  instances: Map<string, DataObject>;
  classes: ClassRegistry;
};
export declare const isBusyRef: (value: unknown) => value is BusyRef;
export declare const decode: (
  value: unknown,
  context: DecodeContext
) => unknown;
