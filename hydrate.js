"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hydrate = exports.assertCompatible = void 0;
const DataObject_1 = require("@civ-clone/core-data-object/DataObject");
const SaveGame_1 = require("./SaveGame");
const registries_1 = require("./registries");
const encode_1 = require("./encode");
const BusyRegistry_1 = require("@civ-clone/core-unit/BusyRegistry");
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
const assertCompatible = (save, game) => {
    if (save.format !== SaveGame_1.FORMAT) {
        throw new SaveGame_1.SaveError(`Unsupported save format ${save.format}; this engine reads ${SaveGame_1.FORMAT}.`);
    }
    const loaded = game.engine.plugins();
    if (Object.keys(loaded).length === 0) {
        throw new SaveGame_1.SaveError('The engine has no plugin manifest, so compatibility cannot be ' +
            'checked. Loading anyway would mean discovering a missing plugin as a ' +
            'failure part-way through hydration.');
    }
    const missing = Object.keys(save.engine.plugins).filter((name) => !(name in loaded));
    if (missing.length > 0) {
        throw new SaveGame_1.SaveError(`Save needs plugins that are not loaded: ${missing.sort().join(', ')}.`);
    }
    const drifted = Object.entries(save.engine.plugins)
        .filter(([name, version]) => loaded[name] !== version)
        .map(([name, version]) => `${name} ${version} → ${loaded[name]}`);
    if (drifted.length > 0) {
        game.engine.emit('save:version-drift', drifted);
    }
};
exports.assertCompatible = assertCompatible;
/**
 * Load a save into a game.
 *
 * Six passes, and only the first two touch entity data. **Allocate-then-fill
 * removes the topological ordering requirement entirely**: references resolve
 * against a complete map, so cycles cost nothing and a plugin adding one field
 * cannot break loading with a confusing error. Entities are still *written* in
 * id order, for diffability rather than because the loader needs it.
 */
const hydrate = (save, game) => {
    (0, exports.assertCompatible)(save, game);
    // Before anything is allocated, or the first entity created after the load
    // takes an id a loaded entity already holds.
    // The turn, before anything can read it. It is recorded in the file's
    // metadata rather than as an entity — nothing references a `Turn` — so
    // without this a loaded game resumes at turn 0 with a turn-40 world. In one
    // process that went unnoticed: the loaded game adopted the same `Turn`
    // object the saved one had been counting. The year follows from the turn.
    game.turn.set(save.meta.turn);
    (0, DataObject_1.restoreIdCounters)(save.idCounters);
    game.rng.restore(save.rng.seed, save.rng.calls);
    const instances = new Map();
    // Pass 1 — allocate. No constructors, so no `city:created`, no `unit:created`
    // and no ordering requirement. This is what the `#private` → `private`
    // migration bought.
    save.entities.forEach(({ id, type }) => {
        const Type = game.classes.get(type);
        if (!Type) {
            throw new SaveGame_1.SaveError(`Unknown entity type '${type}'. Either a plugin is missing, or the ` +
                'class was never registered with `game.classes`.');
        }
        instances.set(id, Object.create(Type.prototype));
    });
    // Pass 2 — fill. `$ref`s resolve against the complete map above.
    const context = { instances, classes: game.classes };
    save.entities.forEach(({ id, keys, state }) => {
        const entity = instances.get(id);
        Object.assign(entity, (0, encode_1.decode)(state, context), {
            _id: id,
            _keys: [...keys],
        });
    });
    // Pass 3 — re-attach the collaborators and caches a file cannot carry, and
    // run any `onHydrated` hook. `inject` throws if it leaves a transient field
    // undefined, so a class this does not know about fails the load rather than
    // returning `undefined` from an accessor.
    // All of them together: a hook may read any other entity — `City` recomputes
    // its fat cross from the world — so filling, hooks and the transient-field
    // assertion are three sweeps rather than one pass per entity.
    game.injectAll(instances.values());
    // Pass 4 — registry membership, in saved order. `EntityRegistry.register`
    // dedupes by identity, so a definition registry that plugin imports already
    // filled does not double up.
    Object.entries(save.registries).forEach(([slot, ids]) => {
        if (registries_1.DISPOSITIONS[slot] !== 'state') {
            throw new SaveGame_1.SaveError(`Save carries membership for '${slot}', which is not runtime state ` +
                'in this engine. Loading it would register duplicates over the ' +
                'definitions plugin imports have already created.');
        }
        const registry = game[slot];
        registry.register(...ids.map((id) => {
            const entity = instances.get(id);
            if (!entity) {
                throw new SaveGame_1.SaveError(`Registry '${slot}' names entity '${id}', which the save does ` +
                    'not contain.');
            }
            return entity;
        }));
    });
    // Pass 5 — rebuild the rules a unit was holding.
    //
    // Separate from the fill because rebuilding one needs the entity that holds
    // it: `decode` walks a field's value with no idea whose field it is, so it
    // leaves the marker alone and this resolves it with the owner in hand.
    //
    // The rule itself is not restored — it is *rebuilt*, by the package that
    // owns it, from the entity and whatever `PendingEffect` says about it. **And
    // that is why it runs here, after registry membership rather than before
    // it.** A delayed action's factory asks `pendingEffects.getByTarget(unit)`
    // for the effect carrying its completion turn, and a registry nothing has
    // been registered into yet answers with nothing: a unit saved part-way
    // through fortifying failed to load, naming an effect the file did in fact
    // contain. Filling the objects is not enough; they have to be *findable*.
    instances.forEach((entity) => {
        const record = entity;
        Object.keys(record).forEach((field) => {
            const value = record[field];
            if ((0, encode_1.isBusyRef)(value)) {
                record[field] = BusyRegistry_1.instance.rebuild(value.$busy, entity);
            }
        });
    });
    // Pass 6 — re-apply the claims players hold on constructor registries.
    reclaim(save, game, instances);
    game.engine.emit('save:loaded', save.meta);
};
exports.hydrate = hydrate;
/**
 * `civ1-player` unregisters a civilisation when a player takes it, so no two
 * players share one. A fresh boot re-registers all of them, so a loaded game
 * would let a later player claim one that is already in use.
 *
 * No extra save data: the restored players already carry their civilisations
 * and leaders, so the claims can be replayed from them.
 */
const reclaim = (save, game, instances) => {
    var _a;
    const players = ((_a = save.registries.players) !== null && _a !== void 0 ? _a : [])
        .map((id) => instances.get(id))
        .filter((entity) => entity !== undefined);
    players.forEach((player) => {
        var _a, _b, _c, _d;
        const civilization = (_b = (_a = player).civilization) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (!civilization) {
            return;
        }
        const CivilizationType = civilization.sourceClass();
        if (game.civilizations.includes(CivilizationType)) {
            game.civilizations.unregister(CivilizationType);
        }
        const leader = (_d = (_c = civilization).leader) === null || _d === void 0 ? void 0 : _d.call(_c);
        if (leader) {
            const LeaderType = leader.sourceClass();
            if (game.leaders.includes(LeaderType)) {
                game.leaders.unregister(LeaderType);
            }
        }
    });
};
exports.default = exports.hydrate;
//# sourceMappingURL=hydrate.js.map