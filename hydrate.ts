import {
  DataObject,
  restoreIdCounters,
} from '@civ-clone/core-data-object/DataObject';
import { FORMAT, SaveError, SaveGame } from './SaveGame';
import { Game, GameSlots } from '@civ-clone/core-game/Game';
import { DISPOSITIONS } from './registries';
import { decode, isBusyRef } from './encode';
import { instance as busyRegistryInstance } from '@civ-clone/core-unit/BusyRegistry';

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
export const assertCompatible = (save: SaveGame, game: Game): void => {
  if (save.format !== FORMAT) {
    throw new SaveError(
      `Unsupported save format ${save.format}; this engine reads ${FORMAT}.`
    );
  }

  const loaded = game.engine.plugins();

  if (Object.keys(loaded).length === 0) {
    throw new SaveError(
      'The engine has no plugin manifest, so compatibility cannot be ' +
        'checked. Loading anyway would mean discovering a missing plugin as a ' +
        'failure part-way through hydration.'
    );
  }

  const missing = Object.keys(save.engine.plugins).filter(
    (name) => !(name in loaded)
  );

  if (missing.length > 0) {
    throw new SaveError(
      `Save needs plugins that are not loaded: ${missing.sort().join(', ')}.`
    );
  }

  const drifted = Object.entries(save.engine.plugins)
    .filter(([name, version]) => loaded[name] !== version)
    .map(([name, version]) => `${name} ${version} → ${loaded[name]}`);

  if (drifted.length > 0) {
    game.engine.emit('save:version-drift', drifted);
  }
};

/**
 * Load a save into a game.
 *
 * Six passes, and only the first two touch entity data. **Allocate-then-fill
 * removes the topological ordering requirement entirely**: references resolve
 * against a complete map, so cycles cost nothing and a plugin adding one field
 * cannot break loading with a confusing error. Entities are still *written* in
 * id order, for diffability rather than because the loader needs it.
 */
export const hydrate = (save: SaveGame, game: Game): void => {
  assertCompatible(save, game);

  // Before anything is allocated, or the first entity created after the load
  // takes an id a loaded entity already holds.
  restoreIdCounters(save.idCounters);
  game.rng.restore(save.rng.seed, save.rng.calls);

  const instances = new Map<string, DataObject>();

  // Pass 1 — allocate. No constructors, so no `city:created`, no `unit:created`
  // and no ordering requirement. This is what the `#private` → `private`
  // migration bought.
  save.entities.forEach(({ id, type }) => {
    const Type = game.classes.get(type);

    if (!Type) {
      throw new SaveError(
        `Unknown entity type '${type}'. Either a plugin is missing, or the ` +
          'class was never registered with `game.classes`.'
      );
    }

    instances.set(id, Object.create(Type.prototype) as DataObject);
  });

  // Pass 2 — fill. `$ref`s resolve against the complete map above.
  const context = { instances, classes: game.classes };

  save.entities.forEach(({ id, keys, state }) => {
    const entity = instances.get(id)!;

    Object.assign(entity, decode(state, context), {
      _id: id,
      _keys: [...keys],
    });
  });

  // Pass 2b — rebuild the rules a unit was holding.
  //
  // Separate from the fill above because rebuilding one needs the entity that
  // holds it: `decode` walks a field's value with no idea whose field it is,
  // so it leaves the marker alone and this resolves it with the owner in hand.
  //
  // The rule itself is not restored — it is *rebuilt*, by the package that owns
  // it, from the entity and whatever `PendingEffect` says about it. A delayed
  // action's completion turn comes from that effect, which is why the order
  // matters: the effects are filled by the loop above, so they are readable by
  // the time a factory asks.
  instances.forEach((entity) => {
    const record = entity as unknown as Record<string, unknown>;

    Object.keys(record).forEach((field) => {
      const value = record[field];

      if (isBusyRef(value)) {
        record[field] = busyRegistryInstance.rebuild(
          value.$busy,
          entity as never
        );
      }
    });
  });

  // Pass 3 — re-attach the collaborators and caches a file cannot carry, and
  // run any `onHydrated` hook. `inject` throws if it leaves a transient field
  // undefined, so a class this does not know about fails the load rather than
  // returning `undefined` from an accessor.
  instances.forEach((entity) => game.inject(entity));

  // Pass 4 — registry membership, in saved order. `EntityRegistry.register`
  // dedupes by identity, so a definition registry that plugin imports already
  // filled does not double up.
  Object.entries(save.registries).forEach(([slot, ids]) => {
    if (DISPOSITIONS[slot as keyof GameSlots] !== 'state') {
      throw new SaveError(
        `Save carries membership for '${slot}', which is not runtime state ` +
          'in this engine. Loading it would register duplicates over the ' +
          'definitions plugin imports have already created.'
      );
    }

    const registry = (game as unknown as Record<string, unknown>)[slot] as {
      register(...entries: DataObject[]): void;
    };

    registry.register(
      ...ids.map((id) => {
        const entity = instances.get(id);

        if (!entity) {
          throw new SaveError(
            `Registry '${slot}' names entity '${id}', which the save does ` +
              'not contain.'
          );
        }

        return entity;
      })
    );
  });

  // Pass 5 — re-apply the claims players hold on constructor registries.
  reclaim(save, game, instances);

  game.engine.emit('save:loaded', save.meta);
};

/**
 * `civ1-player` unregisters a civilisation when a player takes it, so no two
 * players share one. A fresh boot re-registers all of them, so a loaded game
 * would let a later player claim one that is already in use.
 *
 * No extra save data: the restored players already carry their civilisations
 * and leaders, so the claims can be replayed from them.
 */
const reclaim = (
  save: SaveGame,
  game: Game,
  instances: Map<string, DataObject>
): void => {
  const players = (save.registries.players ?? [])
    .map((id) => instances.get(id))
    .filter((entity): entity is DataObject => entity !== undefined);

  players.forEach((player) => {
    const civilization = (
      player as unknown as {
        civilization?: () => { sourceClass<T>(): T; leader?: () => unknown };
      }
    ).civilization?.();

    if (!civilization) {
      return;
    }

    const CivilizationType = civilization.sourceClass<never>();

    if (game.civilizations.includes(CivilizationType)) {
      game.civilizations.unregister(CivilizationType);
    }

    const leader = (
      civilization as { leader?: () => { sourceClass<T>(): T } | null }
    ).leader?.();

    if (leader) {
      const LeaderType = leader.sourceClass<never>();

      if (game.leaders.includes(LeaderType)) {
        game.leaders.unregister(LeaderType);
      }
    }
  });
};

export default hydrate;
