"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClasses = void 0;
const registries_1 = require("./registries");
const ClassRegistry_1 = require("@civ-clone/core-data-object/ClassRegistry");
const DataObject_1 = require("@civ-clone/core-data-object/DataObject");
// The `core-` entity classes, which live in no `ConstructorRegistry` and so
// have to be named. Abstract bases (`Unit`, `Terrain`, `TileImprovement`) are
// deliberately absent: a save never names one, only its concrete subclasses,
// and those come from their own packages.
const City_1 = require("@civ-clone/core-city/City");
const BuildCost_1 = require("@civ-clone/core-city-build/BuildCost");
const BuildItem_1 = require("@civ-clone/core-city-build/BuildItem");
const BuildProgress_1 = require("@civ-clone/core-city-build/Yields/BuildProgress");
const CityBuild_1 = require("@civ-clone/core-city-build/CityBuild");
const CityGrowth_1 = require("@civ-clone/core-city-growth/CityGrowth");
const Civilization_1 = require("@civ-clone/core-civilization/Civilization");
const Expiry_1 = require("@civ-clone/core-diplomacy/Expiry");
const GoodyHut_1 = require("@civ-clone/core-goody-hut/GoodyHut");
const Interaction_1 = require("@civ-clone/core-diplomacy/Interaction");
const LandMass_1 = require("@civ-clone/core-world/LandMass");
const Player_1 = require("@civ-clone/core-player/Player");
const PlayerGovernment_1 = require("@civ-clone/core-government/PlayerGovernment");
const PlayerResearch_1 = require("@civ-clone/core-science/PlayerResearch");
const PlayerTile_1 = require("@civ-clone/core-player-world/PlayerTile");
const PlayerTradeRates_1 = require("@civ-clone/core-trade-rate/PlayerTradeRates");
const PlayerTreasury_1 = require("@civ-clone/core-treasury/PlayerTreasury");
const PlayerWorld_1 = require("@civ-clone/core-player-world/PlayerWorld");
const Spaceship_1 = require("@civ-clone/core-spaceship/Spaceship");
const Layout_1 = require("@civ-clone/core-spaceship/Layout");
const Part_1 = require("@civ-clone/core-spaceship/Part");
const Slot_1 = require("@civ-clone/core-spaceship/Slot");
const StrategyNote_1 = require("@civ-clone/core-strategy/StrategyNote");
const Tile_1 = require("@civ-clone/core-world/Tile");
const WorkedTile_1 = require("@civ-clone/core-city/WorkedTile");
const World_1 = require("@civ-clone/core-world/World");
const CORE_ENTITIES = [
    BuildCost_1.default,
    BuildItem_1.default,
    BuildProgress_1.default,
    City_1.default,
    CityBuild_1.default,
    CityGrowth_1.default,
    Civilization_1.default,
    Expiry_1.default,
    GoodyHut_1.default,
    Interaction_1.default,
    LandMass_1.default,
    Player_1.default,
    PlayerGovernment_1.default,
    PlayerResearch_1.default,
    PlayerTile_1.default,
    PlayerTradeRates_1.default,
    PlayerTreasury_1.default,
    PlayerWorld_1.default,
    Spaceship_1.default,
    Layout_1.default,
    Part_1.default,
    Slot_1.default,
    StrategyNote_1.default,
    Tile_1.default,
    WorkedTile_1.default,
    World_1.default,
];
const registerClasses = (game, options = {}) => {
    const { collisions } = options;
    const add = (...classes) => classes.forEach((Class) => {
        try {
            game.classes.register(Class);
        }
        catch (error) {
            if (collisions && error instanceof ClassRegistry_1.DuplicateTypeError) {
                collisions.push((0, DataObject_1.typeNameOf)(Class));
                return;
            }
            throw error;
        }
    });
    const entriesOf = (slot) => {
        const registry = game[slot];
        return typeof registry === 'object' &&
            registry !== null &&
            typeof registry.entries === 'function'
            ? registry.entries()
            : [];
    };
    const slots = Object.keys(registries_1.DISPOSITIONS);
    // The `ConstructorRegistry` instances hold the classes directly.
    slots
        .filter((slot) => registries_1.DISPOSITIONS[slot] === 'classes')
        .forEach((slot) => add(...entriesOf(slot).filter((entry) => typeof entry === 'function')));
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
    ['attributes', 'traits'].forEach((slot) => add(...entriesOf(slot)
        .filter((entry) => typeof entry === 'object' && entry !== null)
        .map((entry) => entry.constructor)));
    add(...CORE_ENTITIES);
};
exports.registerClasses = registerClasses;
exports.default = exports.registerClasses;
//# sourceMappingURL=registerClasses.js.map