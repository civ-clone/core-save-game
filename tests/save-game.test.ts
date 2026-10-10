import CityName from '@civ-clone/core-civilization/CityName';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Difficulty from '@civ-clone/core-difficulty/Difficulty';
import { DataObject } from '@civ-clone/core-data-object/DataObject';
import { EntityRegistry } from '@civ-clone/core-registry/EntityRegistry';
import { Game } from '@civ-clone/core-game/Game';
import { PendingEffect } from '@civ-clone/core-pending-effect';
import { SaveError } from '../SaveGame';
import { decode, encode } from '../encode';
import { expect } from 'chai';
import { gameForLoad } from '../gameForLoad';
import { assertCompatible, hydrate } from '../hydrate';
import { registerClasses } from '../registerClasses';
import { save } from '../save';
import Action from '@civ-clone/core-unit/Action';
import Busy from '@civ-clone/core-unit/Rules/Busy';
import Unit from '@civ-clone/core-unit/Unit';
import { delayedBusy } from '@civ-clone/core-unit/delayedBusy';
import { registerDelayedAction } from '@civ-clone/core-unit/registerDelayedAction';

/**
 * A minimal entity: a label and a reference to another of its kind, which is
 * enough to make a cycle. Counting constructions is how the tests below prove
 * that loading allocates rather than constructs — a constructor running on
 * load is what would re-fire `city:created` for every city in a saved game.
 */
class Node extends DataObject {
  static constructed = 0;

  private _label: string;
  private _next: Node | null = null;

  constructor(label: string) {
    super();

    Node.constructed += 1;

    this._label = label;

    this.addKey('label', 'next');
  }

  label(): string {
    return this._label;
  }

  next(): Node | null {
    return this._next;
  }

  setNext(next: Node): void {
    this._next = next;
  }
}

const PLUGINS = { '@civ-clone/core-save-game': 'test' };

// A game holding a two-node cycle, reachable only through a pending effect —
// which is also how `save` has to find entities no registry lists.
const gameWithCycle = (): { game: Game; a: Node; b: Node } => {
  const game = new Game();
  const a = new Node('a');
  const b = new Node('b');

  a.setNext(b);
  b.setNext(a);

  game.engine.registerPlugins(PLUGINS);
  registerClasses(game);
  game.classes.register(Node);
  game.pendingEffects.register(
    new PendingEffect('test:owed', a, { endTurn: '41' })
  );

  return { game, a, b };
};

const loadTargetFor = (game: Game): Game =>
  gameForLoad({
    classes: game.classes,
    engine: game.engine,
    rules: game.rules,
  });

describe('encode', (): void => {
  it('should write an entity as a reference, and report it', (): void => {
    const node = new Node('a');
    const seen: DataObject[] = [];

    expect(
      encode(node, { onEntity: (entity) => seen.push(entity) })
    ).to.deep.equal({
      $ref: node.id(),
    });
    expect(seen).to.deep.equal([node]);
  });

  it('should write a class as its name', (): void => {
    expect(encode(Node)).to.deep.equal({ $class: 'Node' });
  });

  it('should refuse a nameless function, naming the field it was found in', (): void => {
    // Built so the engine cannot infer a name: `[(): void => {}][0]` is one of
    // the few ways to get a genuinely anonymous function, since almost every
    // other position — assignment, a property, an argument default — names it.
    const nameless = [(): void => {}][0];

    expect(nameless.name).to.equal('');
    expect(() => encode(nameless, { path: 'City._handler' })).to.throw(
      SaveError,
      /City\._handler/
    );
  });

  it('should refuse a named closure, which is the case that used to load wrong', (): void => {
    // The dangerous one, and the reason the class check exists. This closure
    // is *not* anonymous — the property key names it `handler` — so it used to
    // sail through `encode` as `{ $class: 'handler' }` and fail on **load**,
    // in someone else's session, with "unknown entity type".
    //
    // What catches it is the check that a name resolves back to the very class
    // it was read from. `handler` resolves to nothing, so it is not a class.
    // `save` always passes the registry, so this holds for every real save and
    // not only for a call that opts in.
    const named = { handler: (): void => {} }.handler;

    expect(named.name).to.equal('handler');
    expect(() =>
      encode(named, { classes: new Game().classes, path: 'City._handler' })
    ).to.throw(SaveError, /no registered class/);
  });

  it('should write a registry field as an array of its members', (): void => {
    const registry = new EntityRegistry<Node>(Node);
    const node = new Node('a');

    registry.register(node);

    expect(encode(registry)).to.deep.equal([{ $ref: node.id() }]);
  });

  it('should round-trip maps and sets through decode', (): void => {
    const node = new Node('a');
    const value = {
      byName: new Map<string, Node>([['a', node]]),
      tags: new Set(['x', 'y']),
    };
    const context = {
      instances: new Map<string, DataObject>([[node.id(), node]]),
      classes: new Game().classes,
    };
    const decoded = decode(encode(value), context) as typeof value;

    expect(decoded.byName.get('a')).to.equal(node);
    expect([...decoded.tags]).to.deep.equal(['x', 'y']);
  });

  it('should refuse a reference to an entity the file does not contain', (): void => {
    expect(() =>
      decode(
        { $ref: 'Node-404' },
        { instances: new Map(), classes: new Game().classes }
      )
    ).to.throw(SaveError, /Node-404/);
  });
});

describe('save and hydrate', (): void => {
  it('should refuse to save without a plugin manifest', (): void => {
    // An empty manifest means "cannot check", not "nothing loaded".
    expect(() => save(new Game(), { name: 'test' })).to.throw(
      SaveError,
      /manifest/
    );
  });

  it('should find entities no registry lists, through references', (): void => {
    const { game, a, b } = gameWithCycle();
    const ids = save(game, { name: 'test', createdAt: 0 }).entities.map(
      ({ id }) => id
    );

    expect(ids).to.include.members([a.id(), b.id()]);
  });

  it('should restore a cycle without running a constructor', (): void => {
    const { game, a } = gameWithCycle();
    const file = save(game, { name: 'test', createdAt: 0 });
    const loaded = loadTargetFor(game);
    const before = Node.constructed;

    hydrate(file, loaded);

    const [effect] = loaded.pendingEffects.entries();
    const restored = effect.target() as Node;

    expect(Node.constructed).to.equal(before);
    expect(restored).to.be.instanceOf(Node);
    expect(restored).to.not.equal(a);
    expect(restored.label()).to.equal('a');
    expect(restored.next()?.next()).to.equal(restored);
  });

  it('should carry a pending effect as an ordinary entity', (): void => {
    // Format 1 had a top-level `pendingEffects` placeholder that had to stay
    // empty. Effects are entities now; the field is gone.
    const { game } = gameWithCycle();
    const file = save(game, { name: 'test', createdAt: 0 });

    expect(file).to.not.have.property('pendingEffects');
    expect(file.entities.map(({ type }) => type)).to.include('PendingEffect');
    expect(file.registries.pendingEffects).to.have.length(1);
  });

  it('should load an older file that still carries the empty placeholder', (): void => {
    const { game } = gameWithCycle();
    const file = {
      ...save(game, { name: 'test', createdAt: 0 }),
      pendingEffects: [],
    };

    expect(() => hydrate(file, loadTargetFor(game))).to.not.throw();
  });

  it('should write the same file again after a load', (): void => {
    const { game } = gameWithCycle();
    // Before saving, as a real load would be: the engine boots — constructing
    // its own `Turn` and `Year` — and only then reads a file. Built after the
    // save instead, those two bump the process-wide id counters and the
    // second file differs from the first by exactly that, which is noise
    // rather than a lost field.
    const loaded = loadTargetFor(game);
    const first = save(game, { name: 'test', createdAt: 0 });

    hydrate(first, loaded);

    expect(
      JSON.stringify(save(loaded, { name: 'test', createdAt: 0 }))
    ).to.equal(JSON.stringify(first));
  });
});

describe('the difficulty level', (): void => {
  class Hard extends Difficulty {
    static level(): number {
      return 3;
    }
  }

  it('should round-trip the level a game is played at', (): void => {
    const { game } = gameWithCycle();

    // `registerClasses` reads `availableDifficulties` the same way; `gameWithCycle` has already called it.
    game.classes.register(Hard);
    game.difficulty.set(Hard);

    const loaded = loadTargetFor(game);

    hydrate(save(game, { name: 'test', createdAt: 0 }), loaded);

    expect(loaded.difficulty.get()).to.equal(Hard);
  });

  it('should load a file written before there were levels with none', (): void => {
    const { game } = gameWithCycle();
    const file = save(game, { name: 'test', createdAt: 0 });

    delete file.registries.difficulty;

    const loaded = loadTargetFor(game);

    hydrate(file, loaded);

    expect(loaded.difficulty.get()).to.be.null;
  });
});

/**
 * Just enough of a unit for a delayed action: an id, and a `_busy` holding the
 * rule, which `encode` writes as `$busy` and `hydrate` rebuilds.
 */
class Worker extends DataObject {
  private _busy: Busy | null = null;

  busy(): Busy | null {
    return this._busy;
  }

  setActive(): void {}

  setBusy(busy: Busy | null = null): void {
    this._busy = busy;
  }
}

class Digging extends Busy {}

const DIGGING = 'core-save-game-test:dig';

// As a plugin does it: at import, so against the singleton registries.
registerDelayedAction({
  BusyRule: Digging,
  handler: DIGGING,
  action: (unit: Unit) => ({ unit: () => unit } as unknown as Action),
  complete: (): void => {},
});

describe('a unit part-way through a delayed action', (): void => {
  // A game with registries of its own, not the singletons, which is what any
  // `Game` but `defaultGame` is — and `gameForLoad` builds one of those.
  const gameWithWorker = (): Game => {
    const game = new Game();
    const worker = new Worker();

    game.engine.registerPlugins(PLUGINS);
    registerClasses(game);
    game.classes.register(Worker);
    game.turn.set(4);

    const effect = new PendingEffect(DIGGING, worker, { endTurn: '5' });

    game.pendingEffects.register(effect);
    worker.setBusy(
      delayedBusy(
        Digging,
        { unit: () => worker } as unknown as Action,
        effect,
        game.pendingEffects,
        game.rules,
        game.turn
      )
    );

    return game;
  };

  it('should be rebuilt from the effect in the game it is loaded into', (): void => {
    // civ-clone/web-renderer#245: the factory read the singleton registry,
    // which does not hold this effect, and refused the load.
    const game = gameWithWorker();
    const loaded = loadTargetFor(game);

    hydrate(save(game, { name: 'test', createdAt: 0 }), loaded);

    const [effect] = loaded.pendingEffects.entries();
    const worker = effect.target() as Worker;
    const busy = worker.busy() as Busy;

    expect(busy).to.be.instanceOf(Digging);
    expect(busy.validate()).to.equal(false);

    loaded.turn.increment();

    expect(busy.validate()).to.equal(true);

    busy.process();

    expect(worker.busy()).to.equal(null);
    expect(loaded.pendingEffects.entries()).to.deep.equal([]);
  });
});

class Greek extends Civilization {}
class English extends Civilization {}

/** Just enough of a player and a city for `hydrate` to name the city. */
class OldPlayer extends DataObject {
  private _civilization: Civilization;

  constructor(civilization: Civilization) {
    super();

    this._civilization = civilization;

    this.addKey('civilization');
  }

  civilization(): Civilization {
    return this._civilization;
  }
}

class OldCity extends DataObject {
  private _name: string;
  private _player: OldPlayer;
  private _originalPlayer: OldPlayer;

  constructor(
    name: string,
    player: OldPlayer,
    originalPlayer: OldPlayer = player
  ) {
    super();

    this._name = name;
    this._player = player;
    this._originalPlayer = originalPlayer;

    this.addKey('name', 'player', 'originalPlayer');
  }

  originalPlayer(): OldPlayer {
    return this._originalPlayer;
  }

  name(): string {
    return this._name;
  }

  player(): OldPlayer {
    return this._player;
  }
}

const fillCityNames = (game: Game): void =>
  game.cityNames.register(
    new CityName('Athens', Greek, true),
    new CityName('Sparta', Greek),
    new CityName('Corinth', Greek),
    new CityName('London', English, true),
    new CityName('Athens', English),
    new CityName('Utica', null)
  );

const poolOf = (game: Game): string[] =>
  game.cityNames
    .entries()
    .map(
      (cityName: CityName): string =>
        `${cityName.civilization()?.name ?? '-'}:${cityName.name()}`
    );

describe('city names', (): void => {
  const played = (): Game => {
    const { game } = gameWithCycle();

    game.classes.register(Greek, English);
    fillCityNames(game);
    game.cityNames.takeCapitalByCivilization(Greek);
    game.cityNames.takeCapitalByCivilization(English);
    game.cityNames.takeByCivilization(English);

    return game;
  };

  it('should record the names handed out, with their civilizations', (): void => {
    const file = save(played(), { name: 'test', createdAt: 0 });

    expect(file.cityNames).to.deep.equal({
      taken: [
        { name: 'Athens', civilization: 'Greek' },
        { name: 'London', civilization: 'English' },
        { name: 'Athens', civilization: 'English' },
      ],
      counter: 1,
    });
  });

  it('should take them out of a freshly filled pool on load', (): void => {
    const game = played();
    const loaded = loadTargetFor(game);

    fillCityNames(loaded);
    hydrate(save(game, { name: 'test', createdAt: 0 }), loaded);

    expect(poolOf(loaded)).to.deep.equal(poolOf(game));
    expect(loaded.cityNames.takeCapitalByCivilization(Greek)).to.not.equal(
      'Athens'
    );
  });

  it('should write the same names again after a load', (): void => {
    const game = played();
    const loaded = loadTargetFor(game);
    const first = save(game, { name: 'test', createdAt: 0 });

    fillCityNames(loaded);
    hydrate(first, loaded);

    expect(
      save(loaded, { name: 'test', createdAt: 0 }).cityNames
    ).to.deep.equal(first.cityNames);
  });

  it('should refuse a name whose civilization is not registered', (): void => {
    const game = played();
    const file = save(game, { name: 'test', createdAt: 0 });

    file.cityNames!.taken.push({ name: 'Babylon', civilization: 'Babylonian' });

    expect(() => hydrate(file, loadTargetFor(game))).to.throw(
      SaveError,
      /Babylonian/
    );
  });

  it("should fall back to the cities' names for a file without them", (): void => {
    // A save from before `cityNames` was recorded. The `cities` slot holds
    // stand-ins, which are all `hydrate` needs to name a city.
    const { game } = gameWithCycle();
    const withCities = (): Game =>
      new Game({
        classes: game.classes,
        engine: game.engine,
        rules: game.rules,
        cities: new EntityRegistry(OldCity) as never,
      });
    const source = withCities();
    const english = new OldPlayer(new English());
    const greek = new OldPlayer(new Greek());

    game.classes.register(Greek, English, OldPlayer, OldCity);
    source.cities.register(
      new OldCity('Athens', english) as never,
      new OldCity('Utica', english) as never,
      new OldCity('City #3', english) as never,
      // Founded by the Greeks and captured: its name came from the Greek pool.
      new OldCity('Sparta', english, greek) as never
    );

    const { cityNames, ...file } = save(source, { name: 'test', createdAt: 0 });
    const loaded = withCities();

    fillCityNames(loaded);
    hydrate(file, loaded);

    expect(poolOf(loaded)).to.deep.equal([
      'Greek:Athens',
      'Greek:Corinth',
      'English:London',
    ]);
    expect(loaded.cityNames.counter()).to.equal(4);
  });
});

describe('assertCompatible', (): void => {
  const fileFrom = () => {
    const { game } = gameWithCycle();

    return { game, file: save(game, { name: 'test', createdAt: 0 }) };
  };

  it('should refuse a format it cannot read', (): void => {
    const { game, file } = fileFrom();

    expect(() =>
      assertCompatible({ ...file, format: 99 as never }, game)
    ).to.throw(SaveError, /format 99/);
  });

  it('should refuse a save needing a plugin that is not loaded', (): void => {
    const { game, file } = fileFrom();
    const needing = {
      ...file,
      engine: {
        ...file.engine,
        plugins: { ...file.engine.plugins, '@civ-clone/missing': '1.0.0' },
      },
    };

    expect(() => assertCompatible(needing, game)).to.throw(
      SaveError,
      /@civ-clone\/missing/
    );
  });

  it('should report version drift rather than refusing', (): void => {
    const { game, file } = fileFrom();
    const drifted: string[][] = [];

    game.engine.on('save:version-drift', (changes: string[]) =>
      drifted.push(changes)
    );

    assertCompatible(
      {
        ...file,
        engine: {
          ...file.engine,
          plugins: { '@civ-clone/core-save-game': 'older' },
        },
      },
      game
    );

    expect(drifted).to.deep.equal([['@civ-clone/core-save-game older → test']]);
  });
});
