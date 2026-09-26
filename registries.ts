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
export const DISPOSITIONS: Record<keyof GameSlots, Disposition> = {
  // Runtime state.
  cities: 'state', // 3 City
  cityBuilds: 'state', // 3 CityBuild
  cityGrowth: 'state', // 3 CityGrowth
  cityImprovements: 'state', // 3 Palace
  currentPlayers: 'state', // empty at turn 8; whose turn it is
  goodyHuts: 'state', // 32 GoodyHut
  interactions: 'state', // empty at turn 8; diplomacy in progress
  landMasses: 'state', // 12 LandMass
  playerGovernments: 'state', // 4 PlayerGovernment
  playerResearch: 'state', // 4 PlayerResearch
  playerTradeRates: 'state', // 4 PlayerTradeRates
  playerTreasuries: 'state', // 4 PlayerTreasury
  // What the game owes its entities — a unit part-way through building a road,
  // a player owed free research. These are the *debts*; the handlers that
  // discharge them are functions registered at import and are never saved.
  pendingEffects: 'state',
  playerWorlds: 'state', // 4 PlayerWorld
  players: 'state', // 4 Player
  spaceships: 'state', // empty at turn 8; built late
  // Citizens working no tile: Entertainers, Taxmen and Scientists. Their class is their kind, and the kinds are in
  // `availableSpecialists` (civ-clone/web-renderer#84).
  specialists: 'state',
  // AI working memory, and `GoTo`'s remaining path. It read "empty at turn 8"
  // for a while, which was true and also the reason nobody noticed that
  // `StrategyNote` was not a `DataObject` — the slot was dispositioned as
  // state and wrote nothing at all. It is an entity now.
  strategyNotes: 'state',
  // 1011 Fish/Shield. Reads like a mixed registry and is not: the *definitions*
  // are classes in `availableTerrainFeatures`, and every entry here is a
  // placed, per-tile instance.
  terrainFeatures: 'state',
  tileImprovements: 'state', // 6 Irrigation/Road
  // Which unit is aboard which ship or Carrier: one `TransportManifest` per
  // stowed unit. It was filed under live connections alongside `clients`, as if
  // it held network `Transport`s, so the manifests were never saved and a loaded
  // game had every unit aboard a ship stranded (civ-clone/web-renderer#81).
  transports: 'state',
  unitImprovements: 'state', // 1 Fortified
  units: 'state', // 6 Settlers/Horseman/Warrior
  wonders: 'state', // empty at turn 8
  workedTiles: 'state', // 6 WorkedTile

  // Registered by plugin imports. All of these are non-empty *before* a game
  // starts, which is what distinguishes them.
  additionalData: 'definitions', // 22 AdditionalData
  attributes: 'definitions', // 42 Attribute — DataObjects, but definitions
  cityNames: 'definitions', // 1847 CityName
  rules: 'definitions', // 1055 Rule
  strategies: 'definitions', // AI strategy definitions
  traits: 'definitions', // 42 Trait — DataObjects, but definitions
  // Empty before and after a game, so there is nothing to classify from
  // evidence. Left as a definition registry, and the completeness check in
  // `save` reports it if that ever stops being true.
  yields: 'definitions',

  // `ConstructorRegistry` instances: classes, not entities.
  advances: 'classes', // 67
  aiClients: 'classes', // 1 SimpleAIClient
  availableCityBuildItems: 'classes', // 76
  availableGovernments: 'classes', // 5
  availableSpecialists: 'classes', // 3
  availableTerrainFeatures: 'classes', // 10
  // Added so a save can resolve `Irrigation`, `Road` and `Fortified` by name.
  // `tileImprovements` and `unitImprovements` hold the *built* instances; these
  // hold the classes a ruleset offers, and nothing held them before.
  availableTileImprovements: 'classes', // 5
  availableTradeRates: 'classes', // 3
  availableUnitImprovements: 'classes', // 2
  civilizations: 'classes', // 10 — see `reclaim`
  generators: 'classes', // 1 BaseGenerator
  layouts: 'classes', // 1 Default
  leaders: 'classes', // 10 — see `reclaim`
  pathFinders: 'classes', // 1 BasePathFinder
  terrains: 'classes', // 12

  // Live connections. A client holds a `Transport`, an `EventEmitter` and
  // pending promises; none of that survives a round trip, and `save.clients`
  // carries descriptors for the loader to rebuild from.
  clients: 'never',

  // Not registries.
  classes: 'context',
  engine: 'context',
  rng: 'context',
  turn: 'context',
  year: 'context',
};

export const slotsToSave = (): (keyof GameSlots)[] =>
  (Object.keys(DISPOSITIONS) as (keyof GameSlots)[])
    .filter((slot) => DISPOSITIONS[slot] === 'state')
    .sort();
