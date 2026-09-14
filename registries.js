"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slotsToSave = exports.DISPOSITIONS = void 0;
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
exports.DISPOSITIONS = {
    // Runtime state.
    cities: 'state',
    cityBuilds: 'state',
    cityGrowth: 'state',
    cityImprovements: 'state',
    currentPlayers: 'state',
    goodyHuts: 'state',
    interactions: 'state',
    landMasses: 'state',
    playerGovernments: 'state',
    playerResearch: 'state',
    playerTradeRates: 'state',
    playerTreasuries: 'state',
    // What the game owes its entities — a unit part-way through building a road,
    // a player owed free research. These are the *debts*; the handlers that
    // discharge them are functions registered at import and are never saved.
    pendingEffects: 'state',
    playerWorlds: 'state',
    players: 'state',
    spaceships: 'state',
    strategyNotes: 'state',
    // 1011 Fish/Shield. Reads like a mixed registry and is not: the *definitions*
    // are classes in `availableTerrainFeatures`, and every entry here is a
    // placed, per-tile instance.
    terrainFeatures: 'state',
    tileImprovements: 'state',
    unitImprovements: 'state',
    units: 'state',
    wonders: 'state',
    workedTiles: 'state',
    // Registered by plugin imports. All of these are non-empty *before* a game
    // starts, which is what distinguishes them.
    additionalData: 'definitions',
    attributes: 'definitions',
    cityNames: 'definitions',
    rules: 'definitions',
    strategies: 'definitions',
    traits: 'definitions',
    // Empty before and after a game, so there is nothing to classify from
    // evidence. Left as a definition registry, and the completeness check in
    // `save` reports it if that ever stops being true.
    yields: 'definitions',
    // `ConstructorRegistry` instances: classes, not entities.
    advances: 'classes',
    aiClients: 'classes',
    availableCityBuildItems: 'classes',
    availableGovernments: 'classes',
    availableTerrainFeatures: 'classes',
    // Added so a save can resolve `Irrigation`, `Road` and `Fortified` by name.
    // `tileImprovements` and `unitImprovements` hold the *built* instances; these
    // hold the classes a ruleset offers, and nothing held them before.
    availableTileImprovements: 'classes',
    availableTradeRates: 'classes',
    availableUnitImprovements: 'classes',
    civilizations: 'classes',
    generators: 'classes',
    layouts: 'classes',
    leaders: 'classes',
    pathFinders: 'classes',
    terrains: 'classes',
    // Live connections. A client holds a `Transport`, an `EventEmitter` and
    // pending promises; none of that survives a round trip, and `save.clients`
    // carries descriptors for the loader to rebuild from.
    clients: 'never',
    transports: 'never',
    // Not registries.
    classes: 'context',
    engine: 'context',
    rng: 'context',
    turn: 'context',
    year: 'context',
};
const slotsToSave = () => Object.keys(exports.DISPOSITIONS)
    .filter((slot) => exports.DISPOSITIONS[slot] === 'state')
    .sort();
exports.slotsToSave = slotsToSave;
//# sourceMappingURL=registries.js.map