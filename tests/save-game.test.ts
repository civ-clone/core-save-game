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
    // Built so the engine cannot infer a name — `{ handler: () => {} }.handler`
    // is *not* anonymous: the property key names it `handler`, and it would be
    // written as `{ $class: 'handler' }`, failing only on load. That gap is
    // real; closing it means checking every `$class` against the class
    // registry at save time.
    const nameless = [(): void => {}][0];

    expect(nameless.name).to.equal('');
    expect(() => encode(nameless, { path: 'City._handler' })).to.throw(
      SaveError,
      /City\._handler/
    );
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
