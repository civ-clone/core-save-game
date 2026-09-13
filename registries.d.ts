import { GameSlots } from '@civ-clone/core-game/Game';
/**
 * What a `Game` slot is, for the purposes of saving.
 *
 * - `state` — runtime entities. Membership is saved as an ordered id list.
 * - `definitions` — registered by plugin imports, so a fresh boot already has
 *   them. Saving them would write thousands of entities that the loading engine
 *   re-creates anyway, and then register duplicates on top.
 * - `classes` — a `ConstructorRegistry`, holding classes rather than instances.
 *   Nothing to save; `reclaim` handles the one case where membership is
 *   *removed* at runtime.
 * - `never` — holds live connections. See `save.clients`.
 * - `context` — not a registry at all.
 */
export type Disposition =
  | 'state'
  | 'definitions'
  | 'classes'
  | 'never'
  | 'context';
/**
 * Every slot, classified.
 *
 * **Typed as `Record<keyof GameSlots, Disposition>` deliberately.** Adding a
 * registry to `Game` then fails to compile here until someone decides what it
 * is, which is the only mechanism that makes this list trustworthy as the
 * engine grows. `03-save-format.md` is explicit that inference is a
 * silent-corruption risk: a definition registry saved as state writes garbage
 * and registers duplicates on load, and a state registry skipped loses a
 * player's cities with no error either way.
 *
 * The classifications come from measuring a real four-player game after eight
 * turns rather than from reading names. The counts in the comments are from
 * that run, and they are the evidence — several slots look like definitions and
 * are not, and `terrainFeatures` looks mixed and is not.
 */
export declare const DISPOSITIONS: Record<keyof GameSlots, Disposition>;
export declare const slotsToSave: () => (keyof GameSlots)[];
