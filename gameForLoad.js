"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameForLoad = void 0;
const registries_1 = require("./registries");
const Game_1 = require("@civ-clone/core-game/Game");
/**
 * A `Game` ready to be loaded into: the definitions a fresh boot already has,
 * and nothing else.
 *
 * This is the shape a host needs and it is easy to get wrong in both
 * directions. Adopting *every* slot — `new Game({ ...defaultSlots })` — shares
 * the running game's `cities` and `units`, so hydration registers the loaded
 * entities *alongside* whatever was already there. Adopting *none* gives a game
 * with no rules, no advances and no terrain classes, so nothing can be
 * constructed and `hydrate` fails on the first unknown type.
 *
 * The disposition table already draws the line, so this needs no registry
 * imports of its own: every slot that is not runtime state is carried over, and
 * `Game`'s constructor makes a fresh one of everything else.
 *
 * `rng` is carried over but its stream is not: `hydrate` calls
 * `restore(seed, calls)` from the save, which resumes rather than restarts —
 * the difference decides whether the next combat after a load matches an
 * uninterrupted run.
 */
const gameForLoad = (adopted) => new Game_1.Game(Object.fromEntries(Object.entries(adopted).filter(([slot]) => registries_1.DISPOSITIONS[slot] !== 'state')));
exports.gameForLoad = gameForLoad;
exports.default = exports.gameForLoad;
//# sourceMappingURL=gameForLoad.js.map