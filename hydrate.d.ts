import { SaveGame } from './SaveGame';
import { Game } from '@civ-clone/core-game/Game';
/**
 * Three tiers, from `03-save-format.md`, and the middle one is the reason they
 * are not one check:
 *
 * - **missing plugin — refuse.** The save names entity types this engine cannot
 *   construct, and loading would fail part-way through with a worse message.
 * - **extra plugin — allow.** New rules apply to the restored game. That is how
 *   a player adds a mod to a running game, and it is a feature.
 * - **version drift — warn.** Blocking on it would make saves worthless after
 *   any dependency update, which across 328 packages is constantly.
 */
export declare const assertCompatible: (save: SaveGame, game: Game) => void;
/**
 * Load a save into a game.
 *
 * Six passes, and only the first two touch entity data. **Allocate-then-fill
 * removes the topological ordering requirement entirely**: references resolve
 * against a complete map, so cycles cost nothing and a plugin adding one field
 * cannot break loading with a confusing error. Entities are still *written* in
 * id order, for diffability rather than because the loader needs it.
 */
export declare const hydrate: (save: SaveGame, game: Game) => void;
export default hydrate;
