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
export declare const decode: (
  value: unknown,
  context: DecodeContext
) => unknown;
