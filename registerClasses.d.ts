import { Game } from '@civ-clone/core-game/Game';
/**
 * Populate `game.classes` with everything this package can reach.
 *
 * Two sources:
 *
 * 1. every slot classified `classes` in `registries.ts` — the twelve
 *    `ConstructorRegistry` instances, which between them hold the concrete
 *    units, city improvements, terrains, terrain features, advances,
 *    governments, civilisations and leaders that plugin imports registered;
 * 2. the `core-` entity classes above, which belong to no registry.
 *
 * **This is not sufficient for a cold load, and that is measured rather than
 * assumed** — `tests/engine/save.ts` in the renderer reports every type a real
 * save names that is not resolvable this way. The classes it cannot reach
 * belong to `base-`/`civ1-` packages and are in no registry: tile improvements
 * and unit improvements are built by units rather than by cities, so nothing
 * lists their classes, and `Yield` subclasses are constructed directly.
 *
 * The fix is not to name them here — `core-` packages may only depend on other
 * `core-` packages, and there are 243 packages holding 303 classes. It is a
 * generated manifest, built the same way the host already generates its plugin
 * import list and its version manifest: one place that imports everything, so
 * it cannot drift from what was loaded.
 */
export type RegisterOptions = {
  /**
   * Collect ambiguous names instead of throwing on the first one.
   *
   * There are 21 of them in the engine as it stands — `University` is both an
   * advance and a city improvement, `Communism` both a government and an
   * advance, `Fortified` both a `Busy` rule and a unit improvement — so
   * throwing makes it impossible to see past the first. Collecting lets a host
   * report the whole list, and the names collected are simply absent from the
   * registry, so any save that names one fails to load rather than loading the
   * wrong class.
   */
  collisions?: string[];
};
export declare const registerClasses: (
  game: Game,
  options?: RegisterOptions
) => void;
export default registerClasses;
