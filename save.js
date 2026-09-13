"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.save = void 0;
const DataObject_1 = require("@civ-clone/core-data-object/DataObject");
const SaveGame_1 = require("./SaveGame");
const registries_1 = require("./registries");
const encode_1 = require("./encode");
const registryAt = (game, slot) => {
    const value = game[slot];
    return typeof value === 'object' &&
        value !== null &&
        typeof value.entries === 'function'
        ? value
        : null;
};
/**
 * Check the disposition table still describes the game it is being used on.
 *
 * The table is exhaustive at *compile* time — it is typed
 * `Record<keyof GameSlots, Disposition>`, so a new slot cannot be omitted. What
 * the type cannot check is whether a classification is still true, and two ways
 * of being wrong are worth catching at the point of saving:
 *
 * - a slot classified `context` that turns out to hold a registry, which means
 *   `Game` gained a registry in a slot that used to be scalar;
 * - a slot classified `definitions` that is empty before a game starts and
 *   non-empty after, which is the signature of runtime state hiding in a
 *   definition registry.
 *
 * The second cannot be decided from one snapshot, so this reports only what a
 * single look can establish and leaves the rest to the `definitions` comments.
 */
const assertDispositions = (game) => {
    const wrong = Object.keys(registries_1.DISPOSITIONS)
        .filter((slot) => registries_1.DISPOSITIONS[slot] === 'context')
        .filter((slot) => registryAt(game, slot) !== null);
    if (wrong.length > 0) {
        throw new SaveGame_1.SaveError(`Game slot(s) ${wrong.join(', ')} hold registries but are classified ` +
            "'context' in registries.ts. Saving would skip them silently.");
    }
};
const serialise = (entity, discover) => {
    const record = entity;
    const state = {};
    entity.stateKeys().forEach((field) => {
        state[field] = (0, encode_1.encode)(record[field], { onEntity: discover });
    });
    return {
        id: entity.id(),
        type: (0, DataObject_1.typeNameOf)(entity.sourceClass()),
        // `keys()` is `(keyof this)[]`, which is `string | number | symbol`. Only
        // strings ever reach it in practice — `addKey` is called with literals —
        // and a symbol could not be written to JSON anyway, so coerce and let the
        // round-trip test catch anything stranger.
        keys: entity.keys().map((key) => String(key)),
        state,
    };
};
const save = (game, options = {}) => {
    var _a, _b, _c;
    assertDispositions(game);
    if (Object.keys(game.engine.plugins()).length === 0) {
        // An empty manifest means "cannot check", not "nothing loaded" — see
        // `core-engine`. A save written without one cannot be validated on load, so
        // every compatibility guarantee in the format would be decoration.
        throw new SaveGame_1.SaveError('The engine has no plugin manifest, so this save could never be ' +
            'checked for compatibility. Call `engine.registerPlugins(...)` from ' +
            'whatever generated the plugin list.');
    }
    const entities = new Map();
    const pending = [];
    const seen = new Set();
    const discover = (found) => {
        if (seen.has(found.id())) {
            return;
        }
        seen.add(found.id());
        pending.push(found);
    };
    const registries = {};
    (0, registries_1.slotsToSave)().forEach((slot) => {
        const registry = registryAt(game, slot);
        if (!registry) {
            return;
        }
        const ids = [];
        registry.entries().forEach((entry) => {
            if (typeof entry === 'function' || !(entry instanceof DataObject_1.DataObject)) {
                // A `state` registry holding a class means the disposition is wrong.
                // Refusing beats writing a `$ref` to something that was never an
                // entity.
                throw new SaveGame_1.SaveError(`Registry '${slot}' is classified as runtime state but holds a ` +
                    `${typeof entry === 'function' ? 'class' : typeof entry}. Its ` +
                    'disposition in registries.ts is wrong.');
            }
            ids.push(entry.id());
            discover(entry);
        });
        registries[slot] = ids;
    });
    // Breadth-first, because encoding an entity discovers the entities it
    // references. `World` is reachable only through `Tile._map`, and a `Tile`
    // only through `World._tiles` — neither is in a `Game` registry, so a pass
    // over the registries alone would write a save full of `$ref`s to nothing.
    while (pending.length > 0) {
        const entity = pending.shift();
        if (entities.has(entity.id())) {
            continue;
        }
        entities.set(entity.id(), serialise(entity, discover));
    }
    return {
        format: SaveGame_1.FORMAT,
        engine: {
            plugins: game.engine.plugins(),
            build: (_a = options.build) !== null && _a !== void 0 ? _a : '',
        },
        meta: {
            createdAt: (_b = options.createdAt) !== null && _b !== void 0 ? _b : Date.now(),
            turn: game.turn.value(),
            // `Year.value()` needs a `YearRule`; a game without one has no year to
            // record, and refusing to save over it would be worse than a zero.
            year: (() => {
                try {
                    return game.year.value();
                }
                catch (error) {
                    return 0;
                }
            })(),
            name: (_c = options.name) !== null && _c !== void 0 ? _c : '',
        },
        rng: {
            seed: game.rng.seed(),
            calls: game.rng.calls(),
        },
        idCounters: (0, DataObject_1.idCounters)(),
        // Sorted by id so two saves of the same state are byte-identical, which is
        // what makes the round-trip test a comparison rather than a normalisation
        // exercise.
        entities: [...entities.values()].sort((a, b) => a.id.localeCompare(b.id)),
        registries,
        clients: game.clients.entries().map((client) => {
            const player = client.player();
            return {
                playerId: player.id(),
                kind: 'ai',
                module: client.constructor.name,
            };
        }),
        pendingEffects: [],
    };
};
exports.save = save;
exports.default = exports.save;
//# sourceMappingURL=save.js.map