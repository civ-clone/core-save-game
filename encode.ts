import { ClassRegistry } from '@civ-clone/core-data-object/ClassRegistry';
import { DataObject, typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { SaveError } from './SaveGame';
import Rule from '@civ-clone/core-rule/Rule';

/**
 * A reference to another saved entity. The only way the graph terminates:
 * `City._player` holds a `Player` whose `_civilization` holds a
 * `Civilization`, and `City._tile` reaches the `World` and through it every
 * tile. Inlining any of that either never terminates or writes the same data
 * hundreds of times.
 */
export type Ref = { $ref: string };

/** A class rather than an instance — `PlayerResearch._researching`. */
export type ClassRef = { $class: string };

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
export type BusyRef = { $busy: string };

export type EncodedMap = { $map: [unknown, unknown][] };
export type EncodedSet = { $set: unknown[] };

const isDataObject = (value: unknown): value is DataObject =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as DataObject).id === 'function' &&
  typeof (value as DataObject).stateKeys === 'function';

/**
 * A registry, structurally.
 *
 * `World._tiles` is an `EntityRegistry<Tile>` and is real state, so a registry
 * *held as a field* has to be encoded rather than skipped — unlike the
 * `Game`-level registries, whose membership is recorded separately.
 */
const isRegistry = (value: unknown): value is { entries(): unknown[] } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { entries?: unknown }).entries === 'function' &&
  !Array.isArray(value);

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

const at = (options: EncodeOptions, step: string): EncodeOptions => ({
  ...options,
  path: options.path ? `${options.path}.${step}` : step,
});

export const encode = (
  value: unknown,
  options: EncodeOptions = {}
): unknown => {
  if (value === null || value === undefined) {
    return null;
  }

  if (isDataObject(value)) {
    options.onEntity?.(value);

    return { $ref: value.id() } as Ref;
  }

  if (value instanceof Rule) {
    return {
      $busy: typeNameOf(
        value.constructor as unknown as { name: string; type?: string }
      ),
    } as BusyRef;
  }

  if (typeof value === 'function') {
    const name = typeNameOf(value as unknown as { name: string });

    if (name === '') {
      // An anonymous function has no identity to record, so `{ $class: '' }`
      // could never be decoded — it would fail on load, in someone else's
      // session, with no clue where it came from.
      //
      // In practice this is reached one way: a field holding a `Rule`, whose
      // `Effect` holds the closure the rule was built from. `Unit._busy` is
      // the case — `05-engine-plan.md` predicted it, and it is what Stage 6's
      // rule identities are for. Refusing is deliberate: the alternative is a
      // save that loads with every fortified unit silently un-fortified.
      throw new SaveError(
        `Cannot encode ${options.path ?? '(unknown field)'}: it holds a ` +
          'function with no name, so there is nothing to record that could ' +
          'be resolved on load. A field holding a `Rule` reaches this, ' +
          'because a rule is a closure — it needs a rule identity, which is ' +
          'Stage 6 of the engine plan.'
      );
    }

    return { $class: name } as ClassRef;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => encode(item, at(options, `[${index}]`)));
  }

  if (value instanceof Map) {
    return {
      $map: [...value.entries()].map(([key, item]) => [
        encode(key, at(options, '<key>')),
        encode(item, at(options, '<value>')),
      ]),
    } as EncodedMap;
  }

  if (value instanceof Set) {
    return {
      $set: [...value].map((item, index) =>
        encode(item, at(options, `[${index}]`))
      ),
    } as EncodedSet;
  }

  if (isRegistry(value)) {
    // As an array of encoded members. A registry field is a container, and its
    // identity is its membership in order — `World._tiles` is the case that
    // matters, and its members are entities, so this becomes a list of `$ref`s.
    return value
      .entries()
      .map((item, index) => encode(item, at(options, `[${index}]`)));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as object).map(([key, item]) => [
        key,
        encode(item, at(options, key)),
      ])
    );
  }

  // Primitives, which includes `bigint` — and `JSON.stringify` throws on one
  // rather than dropping it, so a counter that has run past
  // `Number.MAX_SAFE_INTEGER` fails loudly at the point of saving.
  return value;
};

export type DecodeContext = {
  /** id → the allocated instance, complete before any filling starts. */
  instances: Map<string, DataObject>;
  classes: ClassRegistry;
};

const isRef = (value: unknown): value is Ref =>
  typeof value === 'object' && value !== null && '$ref' in value;

const isClassRef = (value: unknown): value is ClassRef =>
  typeof value === 'object' && value !== null && '$class' in value;

export const isBusyRef = (value: unknown): value is BusyRef =>
  typeof value === 'object' && value !== null && '$busy' in value;

const isEncodedMap = (value: unknown): value is EncodedMap =>
  typeof value === 'object' && value !== null && '$map' in value;

const isEncodedSet = (value: unknown): value is EncodedSet =>
  typeof value === 'object' && value !== null && '$set' in value;

export const decode = (value: unknown, context: DecodeContext): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => decode(item, context));
  }

  if (isRef(value)) {
    const instance = context.instances.get(value.$ref);

    if (!instance) {
      // A dangling reference is the one decoding failure that must not be
      // tolerated: returning `null` would leave a `City` with no `_player`,
      // and the first thing to notice would be a renderer crash several turns
      // later rather than the load.
      throw new SaveError(
        `Save refers to entity '${value.$ref}', which it does not contain. ` +
          'The file is incomplete or was written by a different version.'
      );
    }

    return instance;
  }

  if (isBusyRef(value)) {
    // Left for `hydrate` to resolve: rebuilding one needs the entity that
    // holds it, and `decode` is walking a field value with no idea whose it is.
    return value;
  }

  if (isClassRef(value)) {
    const Class = context.classes.get(value.$class);

    if (!Class) {
      throw new SaveError(
        `Save refers to the class '${value.$class}', which is not registered. ` +
          'A plugin that was loaded when this was saved is missing now.'
      );
    }

    return Class;
  }

  if (isEncodedMap(value)) {
    return new Map(
      value.$map.map(([key, item]) => [
        decode(key, context),
        decode(item, context),
      ])
    );
  }

  if (isEncodedSet(value)) {
    return new Set(value.$set.map((item) => decode(item, context)));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decode(item, context)])
  );
};
