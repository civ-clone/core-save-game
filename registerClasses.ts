import { DISPOSITIONS } from './registries';
import { DuplicateTypeError } from '@civ-clone/core-data-object/ClassRegistry';
import { Game, GameSlots } from '@civ-clone/core-game/Game';
import { SaveableClass } from '@civ-clone/core-data-object/ClassRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// The `core-` entity classes, which live in no `ConstructorRegistry` and so
// have to be named. Abstract bases (`Unit`, `Terrain`, `TileImprovement`) are
// deliberately absent: a save never names one, only its concrete subclasses,
// and those come from their own packages.
import City from '@civ-clone/core-city/City';
import Attack from '@civ-clone/core-unit/Yields/Attack';
import BuildCost from '@civ-clone/core-city-build/BuildCost';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import BuildProgress from '@civ-clone/core-city-build/Yields/BuildProgress';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import Capacity from '@civ-clone/core-unit-transport/Yields/Capacity';
import CargoWeight from '@civ-clone/core-unit-transport/Yields/CargoWeight';
import CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Abstain from '@civ-clone/core-diplomacy/Proposal/Abstain';
import Accept from '@civ-clone/core-diplomacy/Proposal/Accept';
import Acknowledge from '@civ-clone/core-diplomacy/Proposal/Acknowledge';
import Declaration from '@civ-clone/core-diplomacy/Declaration';
import Decline from '@civ-clone/core-diplomacy/Proposal/Decline';
import Defence from '@civ-clone/core-unit/Yields/Defence';
import Dialogue from '@civ-clone/core-diplomacy/Negotiation/Dialogue';
import Expiry from '@civ-clone/core-diplomacy/Expiry';
import FoodStorage from '@civ-clone/core-city-growth/Yields/FoodStorage';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import Interaction from '@civ-clone/core-diplomacy/Interaction';
import LandMass from '@civ-clone/core-world/LandMass';
import Research from '@civ-clone/core-science/Yields/Research';
import Movement from '@civ-clone/core-unit/Yields/Movement';
import Moves from '@civ-clone/core-unit/Yields/Moves';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Never from '@civ-clone/core-diplomacy/Expiries/Never';
import Player from '@civ-clone/core-player/Player';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import PlayerTreasury from '@civ-clone/core-treasury/PlayerTreasury';
import PendingEffect from '@civ-clone/core-pending-effect/PendingEffect';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Spaceship from '@civ-clone/core-spaceship/Spaceship';
import SpaceshipLayout from '@civ-clone/core-spaceship/Layout';
import SpaceshipPart from '@civ-clone/core-spaceship/Part';
import SpaceshipSlot from '@civ-clone/core-spaceship/Slot';
import StrategyNote from '@civ-clone/core-strategy/StrategyNote';
import Terminate from '@civ-clone/core-diplomacy/Negotiation/Terminate';
import Tile from '@civ-clone/core-world/Tile';
import Visibility from '@civ-clone/core-unit/Yields/Visibility';
import WorkedTile from '@civ-clone/core-city/WorkedTile';
import World from '@civ-clone/core-world/World';

const CORE_ENTITIES: SaveableClass[] = [
  // `Yield` subclasses are constructed directly and appear in no registry, so
  // every `core-` one has to be named. `Moves` and `FoodStorage` were found
  // missing by the acceptance test rather than by reading the tree, which is
  // why the whole set is here rather than the two that happened to show up in
  // a twelve-turn game.
  //
  // `Research` is here now that the ambiguity is gone. There were three
  // claimants: this one, `base-city-yield-research`'s byte-identical copy —
  // which now re-exports this one, because the city's research yield *is* this
  // quantity — and `base-trade-rate-research`'s, which `extends TradeRate`
  // rather than `Yield`, is genuinely a different thing, and is tagged
  // `ResearchTradeRate`. Before that, a save naming `Research` resolved to the
  // trade rate, because it was the only claimant in a registry.
  Attack,
  Capacity,
  CargoWeight,
  Defence,
  FoodStorage,
  Movement,
  Moves,
  Research,
  Visibility,

  // `core-diplomacy`'s concrete classes. A save names them as soon as two
  // players meet, and before these were here every such save failed to load.
  // `Contact`, `Peace`, `War` and the proposals live in `civ1-diplomacy`.
  Abstain,
  Accept,
  Acknowledge,
  Declaration,
  Decline,
  Dialogue,
  Initiate,
  Negotiation,
  Never,
  Terminate,

  BuildCost,
  BuildItem,
  BuildProgress,
  City,
  CityBuild,
  CityGrowth,
  Civilization,
  Expiry,
  GoodyHut,
  Interaction,
  LandMass,
  Player,
  PlayerGovernment,
  PlayerResearch,
  PlayerTile,
  PlayerTradeRates,
  PlayerTreasury,
  PendingEffect,
  PlayerWorld,
  Spaceship,
  SpaceshipLayout,
  SpaceshipPart,
  SpaceshipSlot,
  StrategyNote,
  Tile,
  WorkedTile,
  World,
] as unknown as SaveableClass[];

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

export const registerClasses = (
  game: Game,
  options: RegisterOptions = {}
): void => {
  const { collisions } = options;

  const add = (...classes: SaveableClass[]): void =>
    classes.forEach((Class) => {
      try {
        game.classes.register(Class);
      } catch (error) {
        if (collisions && error instanceof DuplicateTypeError) {
          collisions.push(typeNameOf(Class));

          return;
        }

        throw error;
      }
    });

  const entriesOf = (slot: keyof GameSlots): unknown[] => {
    const registry = (game as unknown as Record<string, unknown>)[slot];

    return typeof registry === 'object' &&
      registry !== null &&
      typeof (registry as { entries?: unknown }).entries === 'function'
      ? (registry as { entries(): unknown[] }).entries()
      : [];
  };

  const slots = Object.keys(DISPOSITIONS) as (keyof GameSlots)[];

  // The `ConstructorRegistry` instances hold the classes directly.
  slots
    .filter((slot) => DISPOSITIONS[slot] === 'classes')
    .forEach((slot) =>
      add(
        ...(entriesOf(slot).filter(
          (entry) => typeof entry === 'function'
        ) as SaveableClass[])
      )
    );

  // Two definition registries hold *instances* whose classes a save can name —
  // `traits` holds 42 `Trait`s and `attributes` 42 `Attribute`s — and taking
  // the constructor of each is the only way to reach them without depending on
  // the 40-odd `base-leader-trait-*` packages they live in.
  //
  // Named rather than derived from the disposition, because harvesting *every*
  // definition registry reaches `rules`: 1,055 `Rule` instances whose class
  // names collide 271 times over (`Action`, `Built`, `Cost`, `Created`,
  // `Yield`…) and not one of which is ever a saved entity. The collisions were
  // real but the entries were noise, and a registry full of refused names is
  // worse than one without them.
  (['attributes', 'traits'] as (keyof GameSlots)[]).forEach((slot) =>
    add(
      ...(entriesOf(slot)
        .filter((entry) => typeof entry === 'object' && entry !== null)
        .map((entry) => (entry as object).constructor) as SaveableClass[])
    )
  );

  add(...CORE_ENTITIES);
};

export default registerClasses;
