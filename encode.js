"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decode = exports.isBusyRef = exports.encode = void 0;
const DataObject_1 = require("@civ-clone/core-data-object/DataObject");
const SaveGame_1 = require("./SaveGame");
const Rule_1 = require("@civ-clone/core-rule/Rule");
const isDataObject = (value) => typeof value === 'object' &&
    value !== null &&
    typeof value.id === 'function' &&
    typeof value.stateKeys === 'function';
/**
 * A registry, structurally.
 *
 * `World._tiles` is an `EntityRegistry<Tile>` and is real state, so a registry
 * *held as a field* has to be encoded rather than skipped — unlike the
 * `Game`-level registries, whose membership is recorded separately.
 */
const isRegistry = (value) => typeof value === 'object' &&
    value !== null &&
    typeof value.entries === 'function' &&
    !Array.isArray(value);
const at = (options, step) => ({
    ...options,
    path: options.path ? `${options.path}.${step}` : step,
});
const encode = (value, options = {}) => {
    var _a, _b;
    if (value === null || value === undefined) {
        return null;
    }
    if (isDataObject(value)) {
        (_a = options.onEntity) === null || _a === void 0 ? void 0 : _a.call(options, value);
        return { $ref: value.id() };
    }
    if (value instanceof Rule_1.default) {
        return {
            $busy: (0, DataObject_1.typeNameOf)(value.constructor),
        };
    }
    if (typeof value === 'function') {
        const name = (0, DataObject_1.typeNameOf)(value);
        if (name === '') {
            // An anonymous function has no identity to record, so `{ $class: '' }`
            // could never be decoded — it would fail on load, in someone else's
            // session, with no clue where it came from.
            //
            // A `Rule` no longer reaches here — it is caught above and written as
            // `$busy`, its identity, which `BusyRegistry` rebuilds on load. What
            // does reach here is a closure held directly in a field, which has no
            // identity at all. Refusing is deliberate: the alternative is a save
            // that loads with the behaviour silently missing.
            throw new SaveGame_1.SaveError(`Cannot encode ${(_b = options.path) !== null && _b !== void 0 ? _b : '(unknown field)'}: it holds a ` +
                'function with no name, so there is nothing to record that could ' +
                'be resolved on load. Keep behaviour in code and save what it ' +
                'needs — a `PendingEffect` names its handler for exactly this reason.');
        }
        return { $class: name };
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => (0, exports.encode)(item, at(options, `[${index}]`)));
    }
    if (value instanceof Map) {
        return {
            $map: [...value.entries()].map(([key, item]) => [
                (0, exports.encode)(key, at(options, '<key>')),
                (0, exports.encode)(item, at(options, '<value>')),
            ]),
        };
    }
    if (value instanceof Set) {
        return {
            $set: [...value].map((item, index) => (0, exports.encode)(item, at(options, `[${index}]`))),
        };
    }
    if (isRegistry(value)) {
        // As an array of encoded members. A registry field is a container, and its
        // identity is its membership in order — `World._tiles` is the case that
        // matters, and its members are entities, so this becomes a list of `$ref`s.
        return value
            .entries()
            .map((item, index) => (0, exports.encode)(item, at(options, `[${index}]`)));
    }
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            (0, exports.encode)(item, at(options, key)),
        ]));
    }
    // Primitives, which includes `bigint` — and `JSON.stringify` throws on one
    // rather than dropping it, so a counter that has run past
    // `Number.MAX_SAFE_INTEGER` fails loudly at the point of saving.
    return value;
};
exports.encode = encode;
const isRef = (value) => typeof value === 'object' && value !== null && '$ref' in value;
const isClassRef = (value) => typeof value === 'object' && value !== null && '$class' in value;
const isBusyRef = (value) => typeof value === 'object' && value !== null && '$busy' in value;
exports.isBusyRef = isBusyRef;
const isEncodedMap = (value) => typeof value === 'object' && value !== null && '$map' in value;
const isEncodedSet = (value) => typeof value === 'object' && value !== null && '$set' in value;
const decode = (value, context) => {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => (0, exports.decode)(item, context));
    }
    if (isRef(value)) {
        const instance = context.instances.get(value.$ref);
        if (!instance) {
            // A dangling reference is the one decoding failure that must not be
            // tolerated: returning `null` would leave a `City` with no `_player`,
            // and the first thing to notice would be a renderer crash several turns
            // later rather than the load.
            throw new SaveGame_1.SaveError(`Save refers to entity '${value.$ref}', which it does not contain. ` +
                'The file is incomplete or was written by a different version.');
        }
        return instance;
    }
    if ((0, exports.isBusyRef)(value)) {
        // Left for `hydrate` to resolve: rebuilding one needs the entity that
        // holds it, and `decode` is walking a field value with no idea whose it is.
        return value;
    }
    if (isClassRef(value)) {
        const Class = context.classes.get(value.$class);
        if (!Class) {
            throw new SaveGame_1.SaveError(`Save refers to the class '${value.$class}', which is not registered. ` +
                'A plugin that was loaded when this was saved is missing now.');
        }
        return Class;
    }
    if (isEncodedMap(value)) {
        return new Map(value.$map.map(([key, item]) => [
            (0, exports.decode)(key, context),
            (0, exports.decode)(item, context),
        ]));
    }
    if (isEncodedSet(value)) {
        return new Set(value.$set.map((item) => (0, exports.decode)(item, context)));
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, (0, exports.decode)(item, context)]));
};
exports.decode = decode;
//# sourceMappingURL=encode.js.map