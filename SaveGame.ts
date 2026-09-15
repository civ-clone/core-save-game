/**
 * The save format, from `03-save-format.md`.
 *
 * `format` is a single integer rather than a semver string on purpose: it gates
 * whether this code can read the file at all, and the engine's 328 package
 * versions answer the finer-grained question separately in `engine.plugins`.
 */
export type SaveGame = {
  format: 1;

  engine: {
    /** Every loaded package at save time, name → exact version. */
    plugins: { [name: string]: string };
    /** Build identifier, for reporting rather than gating. */
    build: string;
  };

  meta: {
    createdAt: number;
    turn: number;
    year: number;
    name: string;
  };

  /**
   * Seed *and* draw count, so loading resumes the stream rather than
   * restarting it. Restarting would make a save/load cycle change the outcome
   * of the next combat, which is the class of bug that makes replay testing
   * untrustworthy.
   */
  rng: {
    seed: number;
    calls: number;
  };

  /** `DataObject` id counters, restored before anything is allocated. */
  idCounters: { [type: string]: number };

  entities: SerialisedEntity[];

  /** Registry slot name → member ids, in registration order. */
  registries: { [slot: string]: string[] };

  /** Descriptors, never the client objects — see `save.ts`. */
  clients: { playerId: string; kind: 'human' | 'ai'; module: string }[];

  // No `pendingEffects` field. Format 1 was written with one — always empty,
  // and `hydrate` refused anything else — as a placeholder until effects had a
  // saveable shape. They do now, and it is the ordinary one: a `PendingEffect`
  // is a `DataObject` in the `pendingEffects` registry slot, so it travels in
  // `entities` and `registries` like everything else. Older files still carry
  // `"pendingEffects": []`, which nothing reads.
};

export type SerialisedEntity = {
  id: string;

  /** `typeNameOf(Class)` — an explicit `static type` if declared, else the name. */
  type: string;

  /**
   * `DataObject._keys`, which drives `toPlainObject()` and so decides what the
   * renderer receives.
   *
   * Beside `state` rather than inside it, because it is bookkeeping rather than
   * state — `_id` is handled the same way. It has to be here at all because
   * constructors build it with `addKey()` and no `Game` can supply it: a
   * hydrated entity without it throws from `toPlainObject()`, and a loaded game
   * would send the renderer nothing. Putting it in `state` instead would mean
   * removing `_keys` from `DataObject.transient`, which moves the conformance
   * checksum for something that is not state.
   */
  keys: string[];

  /** Non-transient fields, encoded — see `encode.ts`. */
  state: { [field: string]: unknown };
};

export class SaveError extends Error {}

export const FORMAT: SaveGame['format'] = 1;
