# core-save-game

Save and load a `Game`, implementing
[`03-save-format.md`](https://github.com/civ-clone/web-renderer/blob/main/docs/engine-serialisation/03-save-format.md).

```ts
import { hydrate, save } from '@civ-clone/core-save-game';

const file = save(game, { name: 'autosave' });

hydrate(file, new Game());
```

`save` walks the registries holding runtime state and records every entity's
non-transient fields. `hydrate` allocates each entity with
`Object.create(Type.prototype)` — never a constructor, so nothing re-emits
`city:created` — fills it, then hands it to `Game.inject` for the collaborators
and caches a file cannot carry.

The design notes worth reading before changing anything here:

- **`lib: es2020`, and `@types/node` declared.** These packages typecheck their
  dependencies' *source*, which reaches `BigInt` and `console`. Five packages
  needed this retrofitted; it is here from the start.
- **Registry dispositions are explicit and exhaustive.** `registries.ts` types
  its table as `Record<keyof GameSlots, Disposition>`, so adding a slot to
  `Game` fails to compile here until someone says whether it is saved. A
  definition registry saved as state, or a state registry skipped, both produce
  a file that loads without complaint.
- **`pendingEffects` refuses rather than drops.** Until rule identity lands
  (Stage 6 of the engine plan), a save carrying continuations cannot be
  restored, and silently discarding them would lose a queued effect with no
  symptom.
