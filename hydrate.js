"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hydrate = exports.assertCompatible = void 0;
const DataObject_1 = require("@civ-clone/core-data-object/DataObject");
const SaveGame_1 = require("./SaveGame");
const registries_1 = require("./registries");
const encode_1 = require("./encode");
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
    if (save.pendingEffects.length > 0) {
        // Refusing rather than dropping. A pending effect is a queued continuation
        // — Darwin's Voyage registers one — and discarding it silently would lose
        // the effect with no symptom until a player noticed they never got it.
        // Restoring one needs rule identity, which is Stage 6 of the engine plan.
        throw new SaveGame_1.SaveError(`This save carries ${save.pendingEffects.length} pending effect(s), ` +
            'which cannot be restored until rules have identities. Refusing ' +
            'rather than dropping them.');
    }
    // Before anything is allocated, or the first entity created after the load
    // takes an id a loaded entity already holds.
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
    instances.forEach((entity) => game.inject(entity));
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
    // Pass 5 — re-apply the claims players hold on constructor registries.
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