/**
 * The save format, from `03-save-format.md`.
 *
 * **Format 2.** Format 1 wrote `PlayerTreasury._yield` as `{ $class: 'Gold' }`,
 * and three packages declare a class called `Gold`. Such a save loads without
 * error and applies no production, food or trade, because the treasury lookup
 * finds nothing and throws inside `ProcessYield`. There is no way to tell from
 * the file which `Gold` was meant, so format 1 files are refused rather than
 * loaded into a game that quietly does not work. `encode` now checks that a
 * class reference resolves back to itself, so this cannot recur silently.
 *
 * `format` is a single integer rather than a semver string on purpose: it gates
 * whether this code can read the file at all, and the engine's 328 package
 * versions answer the finer-grained question separately in `engine.plugins`.
 */
export type SaveGame = {
  format: 2;
  engine: {
    /** Every loaded package at save time, name → exact version. */
    plugins: {
      [name: string]: string;
    };
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
  idCounters: {
    [type: string]: number;
  };
  entities: SerialisedEntity[];
  /** Registry slot name → member ids, in registration order. */
  registries: {
    [slot: string]: string[];
  };
  /**
   * The city names handed out so far, and the next `City #n`.
   *
   * The name pool is filled by plugin imports, so it is a definition registry
   * and its membership is not saved: a loaded game gets a full pool. Recording
   * what has been *taken* is the smaller half — a few dozen names against
   * about 1,850 — and `hydrate` takes them out of the pool again. Each name
   * carries its civilization, because names repeat between civilizations.
   *
   * Optional without a format change: a file written before this has none,
   * and `hydrate` then falls back to the names of the cities in the file
   * (civ-clone/web-renderer#120).
   */
  cityNames?: {
    taken: {
      name: string;
      civilization: string | null;
    }[];
    counter: number;
  };
  /** Descriptors, never the client objects — see `save.ts`. */
  clients: {
    playerId: string;
    kind: 'human' | 'ai';
    module: string;
  }[];
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
  state: {
    [field: string]: unknown;
  };
};
export declare class SaveError extends Error {}
export declare const FORMAT: SaveGame['format'];
