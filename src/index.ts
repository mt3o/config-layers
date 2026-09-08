import type {
    LayerName,
    ConfigInspectionResult,
    ConfigOptions,
    ConfigHandle,
    DeepOptionalAndUndefined,
    ArrayMergeStrategy,
    NotFoundHandler,
} from "./types";

export type {LayerName, ConfigInspectionResult, ConfigOptions, ConfigHandle, DeepOptionalAndUndefined};


function isString(key: string | symbol | number) {
    return typeof key === 'string';
}

const DOT = 46; // '.'

/** Hoisted: resolving `Object.prototype.hasOwnProperty` costs two property reads per lookup. */
const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Splits a key that contains an escape (a run of two or more dots), character by character.
 * Only reached on a cache miss for keys that actually contain `..`.
 */
function splitEscapedPath(str: string): string[] {
    const parts: string[] = [];
    let segment = '';
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) !== DOT) {
            segment += str[i];
            continue;
        }
        // measure the run of consecutive dots starting here
        let run = 1;
        while (str.charCodeAt(i + run) === DOT) run++;
        if (run === 1) {
            // a lone dot separates segments
            parts.push(segment);
            segment = '';
        } else {
            // a run of N dots is an escape contributing N-1 literal dots, and does not split
            segment += '.'.repeat(run - 1);
        }
        i += run - 1;
    }
    parts.push(segment);
    return parts;
}

const PATH_CACHE_LIMIT = 1000;
const pathCache = new Map<string, readonly string[]>();

/**
 * Splits a config key into its path segments.
 *
 * A single `.` separates segments; a run of two or more dots is an escape that contributes
 * `run - 1` literal dots to the current segment without splitting. So `a.b` -> `['a','b']`,
 * `a..b` -> `['a.b']` and `a...b` -> `['a..b']`.
 *
 * Deliberately regex-free. The previous implementation split on a lookbehind assertion, which
 * Safari only supports from 16.4 - below that esbuild silently rewrites the literal to
 * `new RegExp(...)` and it throws at runtime on the first key lookup.
 *
 * Resolved paths are cached, since a config is read repeatedly through a small, fixed key set.
 * The returned array is shared and frozen; callers must treat it as read-only.
 */
function splitPath(str: string): readonly string[] {
    // no separator and nothing to unescape - by far the most common case
    if (str.indexOf('.') === -1) return [str];

    const cached = pathCache.get(str);
    if (cached !== undefined) return cached;

    const parts = str.indexOf('..') === -1
        ? str.split('.')            // no escapes present, so every dot separates
        : splitEscapedPath(str);

    if (pathCache.size < PATH_CACHE_LIMIT) {
        const frozen = Object.freeze(parts);
        pathCache.set(str, frozen);
        return frozen;
    }
    return parts;
}

/**
 * Deeply merges an array field into the target object based on the specified merge strategy.
 * It supports different strategies {ArrayMergeStrategy}, to determine
 * how the new array values are merged with the existing ones. So - are they merged/concat/replaced
 *
 * @template T type for the target parameter
 * @template U type for the source parameter
 * @param {T} target - The target object where the array field will be merged.
 * @param {U} source - The source object containing the array field and potentially strategy overrides.
 * @param {string} key - The key of the array field in the target object to be merged.
 * @param {any[]} value - The array of values to merge into the target object's array field.
 * @param {Partial<ConfigOptions>} [options] - Optional configuration, including the global array merge strategy and the local strategy field suffix.
 * @returns {void} This function does not return a value; it modifies the target object in place.
 */
function deepMergeArrayField<T extends object, U extends object>(
    target: T,
    source: U,
    key: string,
    value: any[],
    options?: Partial<ConfigOptions>,
) {
    const strategy = options?.arrayMergeStrategy ?? 'override';

    const localOverrideStrategyFieldName = options?.arrayLocalMergeStrategyNameSuffix
        ? `${key}${options.arrayLocalMergeStrategyNameSuffix}`
        : undefined;

    const localOverrideStrategy: ArrayMergeStrategy|string = localOverrideStrategyFieldName!==undefined
        ? (source as any)?.[localOverrideStrategyFieldName] ?? (target as any)?.[localOverrideStrategyFieldName]
        : strategy;

    // These results may still share element references with the caller's layers; finalizeOwned
    // copies them once at the end of construction.
    switch(localOverrideStrategy){
        case 'concat':
            (target as any)[key] = [...(target as any)[key], ...value];
            break;
        case 'union':
            (target as any)[key] = Array.from(new Set([...(target as any)[key], ...value]));
            break;
        case 'override':
        default:
            (target as any)[key] = value;
    }
}

/**
 * Keys that must never be written through while merging. Assigning any of them would let a config
 * layer reach `Object.prototype` and pollute every object in the process - a layer parsed from
 * untrusted JSON can carry `__proto__` as a genuine own property, which `hasOwnProperty` does not
 * filter out.
 */
const UNSAFE_KEYS = new Set<string>(['__proto__', 'constructor', 'prototype']);

/**
 * True only for values that can be safely merged key by key: plain object literals, and
 * null-prototype objects such as those from `Object.create(null)`.
 *
 * Everything else - `Date`, `RegExp`, `Map`, `Set`, `Buffer`, class instances - carries behavior
 * or internal slots that a key-by-key copy would silently destroy (a `Date` copied this way
 * becomes `{}`), so `cloneOwned` reconstructs those rather than merging into them.
 */
function isPlainObject(value: unknown): value is Record<string, any> {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
}

/**
 * Deep-copies a value so the config owns it outright.
 *
 * Everything the config exposes has to be its own, or freezing it would be a side effect on data
 * the caller still holds - and a value shared with a layer would keep changing under the config
 * after construction. Plain objects are already rebuilt key by key by `deepMerge`; this covers
 * everything else.
 *
 * Built-ins keep their identity by being reconstructed rather than copied property by property: a
 * `Date` copied key-by-key would come out as `{}`, since its value lives in an internal slot.
 * Other objects are rebuilt on their original prototype, so methods and `instanceof` survive.
 *
 * Two things it cannot reproduce, both inherent rather than incidental:
 *  - **private class fields** (`#x`) are unreachable from outside the class, so a method that
 *    depends on one will throw on the copy;
 *  - **functions** are returned by reference, since a closure cannot be cloned.
 */
function cloneOwned(value: any): any {
    // Scalars and functions are the overwhelming majority of merged values; checking them first
    // keeps this off the hot path. Functions are shared deliberately - see above.
    if (value === null || typeof value !== 'object') return value;

    if (Array.isArray(value)) {
        // `slice` is a native bulk copy; only elements that are themselves containers need more.
        const copy = value.slice();
        for (let i = 0; i < copy.length; i++) {
            const element = copy[i];
            if (element !== null && typeof element === 'object') copy[i] = cloneOwned(element);
        }
        return copy;
    }

    if (isPlainObject(value)) {
        const copy: Record<string, any> = {};
        for (const key in value) {
            if (hasOwn.call(value, key) && !UNSAFE_KEYS.has(key)) {
                copy[key] = cloneOwned(value[key]);
            }
        }
        return copy;
    }

    // Built-ins whose state lives in internal slots, so they must be reconstructed.
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);
    if (value instanceof Map) {
        const copy = new Map();
        value.forEach((entry, entryKey) => copy.set(cloneOwned(entryKey), cloneOwned(entry)));
        return copy;
    }
    if (value instanceof Set) {
        const copy = new Set();
        value.forEach((entry) => copy.add(cloneOwned(entry)));
        return copy;
    }
    if (ArrayBuffer.isView(value)) {
        // Typed arrays and Buffer. `from` copies for both; `Buffer.prototype.slice` would not, it
        // returns a view over the same memory.
        const ctor = (value as any).constructor;
        if (typeof ctor?.from === 'function') return ctor.from(value as any);
        return value;
    }

    // Anything else: rebuild on the same prototype so methods and `instanceof` survive. Descriptors
    // rather than plain assignment, so getters, setters, non-enumerables and symbol keys are kept
    // as they were instead of being flattened into data properties.
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptorKey of Reflect.ownKeys(descriptors)) {
        const descriptor = (descriptors as any)[descriptorKey];
        if ('value' in descriptor) descriptor.value = cloneOwned(descriptor.value);
    }
    return Object.create(Object.getPrototypeOf(value), descriptors);
}

/**
 * How many distinct missing keys one config remembers having warned about. Past this it warns
 * every time again, which is noisy but honest - the alternative would be going silent.
 */
const WARNED_KEYS_LIMIT = 1000;

/**
 * Builds the default `notFoundHandler`: warn once per key, and resolve the key to `undefined`.
 *
 * One handler - and one set of already-warned keys - per config, rather than a module-level one,
 * so two unrelated configs do not silence each other and nothing outlives the config that created
 * it. A derived config inherits its parent's handler along with the rest of the options, so
 * deriving does not re-warn about a key the parent has already reported.
 *
 * De-duplicating matters beyond tidiness: a missing key read inside a loop would otherwise emit a
 * `console.warn` per iteration, and that is synchronous I/O.
 */
function createDefaultNotFoundHandler(): NotFoundHandler {
    // Keyed on the raw key rather than its string form, so two symbols sharing a description are
    // not treated as the same key.
    const warned = new Set<string | symbol | number>();

    return (key) => {
        if (warned.has(key)) return undefined;
        if (warned.size < WARNED_KEYS_LIMIT) warned.add(key);
        console.warn(`[config-layers] Key not found: ${String(key)}`);
        return undefined;
    };
}

/**
 * Turns the layer map back into the array shape `fromLayers` takes, preserving both insertion
 * order and symbol-named layers - neither of which survives a round-trip through a plain object.
 */
function __layerList<V>(layers: Map<LayerName, V>): Array<{ name: LayerName, config: V }> {
    return Array.from(layers, ([name, config]) => ({name, config}));
}

function deepMerge<T extends object, U extends object>(target: T, source: U, options?: Partial<ConfigOptions>): T & U {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (UNSAFE_KEYS.has(key)) continue;

            const value = source[key];
            if (value === null && !options?.acceptNull) continue;
            if (value === undefined && !options?.acceptUndefined) continue;

            if (isPlainObject(value)) {
                // Only merge into another plain object. If the target side holds a scalar, an
                // array or a non-plain object, the incoming object replaces it - merging into it
                // would either throw (assigning a property to a primitive is a TypeError in strict
                // mode) or corrupt the value.
                if (!isPlainObject((target as any)[key])) {
                    (target as any)[key] = {};
                }
                deepMerge((target as any)[key], value, options);
            } else if (Array.isArray(value) && Array.isArray((target as any)[key])) {
                deepMergeArrayField(target, source, key, value, options);
            } else {
                // Arrays are stored by reference here and copied once by finalizeOwned, after
                // every layer has been folded in - cloning per layer would clone arrays that a
                // later layer immediately discards.
                (target as any)[key] = value;
            }
        }
    }
    return target as T & U;
}

/**
 * Single pass over the merged result that makes it genuinely the config's own, and optionally
 * freezes it.
 *
 * The merge stores arrays by reference, because a key present in several layers would otherwise be
 * copied once per layer only for the last one to win. This pass runs after the fold, so it copies
 * exactly the arrays that survived - and it is fused with freezing so the tree is walked once
 * rather than twice.
 *
 * Plain objects in the spine were already rebuilt key by key by `deepMerge`, so they only need
 * recursing into. Non-plain values (`Date`, `Map`, class instances) are left by reference and
 * unfrozen: they belong to the caller and cannot be cloned generically.
 */
function finalizeOwned<T extends object>(node: T, freeze: boolean): T {
    for (const key in node) {
        if (!hasOwn.call(node, key)) continue;

        const value = (node as any)[key];
        if (value === null || typeof value !== 'object') continue;

        if (isPlainObject(value)) {
            // Already the config's own: deepMerge rebuilt it key by key.
            finalizeOwned(value, freeze);
        } else {
            // Arrays, Dates, Maps, class instances - all still the caller's, so copy before
            // freezing. Cloning here rather than during the merge means a key present in several
            // layers is copied once, not once per layer.
            const owned = cloneOwned(value);
            (node as any)[key] = owned;
            if (freeze) deepFreeze(owned);
        }
    }
    if (freeze) Object.freeze(node);
    return node;
}

/**
 * True unless freezing the value would break it.
 *
 * Two built-ins cannot take a freeze:
 *  - **typed arrays and `Buffer`**: `Object.freeze` on an `ArrayBuffer` view that has elements
 *    throws outright, so freezing one would abort construction;
 *  - **`RegExp`**: `test` and `exec` write `lastIndex` on `/g` and `/y` patterns, so a frozen
 *    regex throws the first time it is used.
 *
 * Skipping them costs nothing. `cloneOwned` has already copied the value, so the caller's object
 * is protected either way, and a regex pattern or a buffer's byte length were never mutable
 * through property assignment to begin with.
 */
function isFreezable(value: object): boolean {
    return !ArrayBuffer.isView(value) && !(value instanceof RegExp);
}

/**
 * Freezes the merged result. Everything reachable from it is the config's own copy by this point
 * (see `cloneOwned`), so nothing here belongs to the caller.
 *
 * `Object.freeze` does not reach state held in internal slots, so a frozen `Map` still accepts
 * `map.set(...)` and a frozen `Date` still accepts `setTime(...)`. Their *contents* are frozen
 * where they can be, and because they are copies, mutating one can no longer affect the caller.
 */
function deepFreeze<T>(obj: T): T {
    if (!obj || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
    if (!isFreezable(obj)) return obj;

    if (Array.isArray(obj)) {
        // Walk by index. `Object.getOwnPropertyNames` on an array materializes every index as a
        // string plus 'length', which dominates the cost on array-heavy configs.
        for (let i = 0; i < obj.length; i++) {
            const value = obj[i];
            if (value && typeof value === "object") deepFreeze(value);
        }
    } else {
        for (const key in obj) {
            if (hasOwn.call(obj, key)) {
                const value = (obj as any)[key];
                if (value && typeof value === "object") deepFreeze(value);
            }
        }
        // Map and Set entries live in internal slots, so `for...in` never sees them.
        if (obj instanceof Map) obj.forEach((value) => deepFreeze(value));
        else if (obj instanceof Set) obj.forEach((value) => deepFreeze(value));
    }

    Object.freeze(obj);
    return obj;
}

/**
 * LayeredConfig provides a proxy-based API for merging and inspecting configuration from multiple layers.
 *
 * @template Schema - The configuration schema type.
 *
 * @example
 * **Use as config file**
 * ```ts :@import.meta.vitest
 * type Schema = {
 *  apiUrl: string;
 *  timeout: number;
 *  apiUrl: string;
 * }
 * const config = LayeredConfig.fromLayers<Schema>([
 *   { name: 'default', config: { apiUrl: 'https://api.example.com', timeout: 5000 } },
 *   { name: 'env', config: { timeout: 3000 } },
 *   { name: 'user', config: { apiUrl: 'https://custom-api.example.com' } },
 * ]);
 * expect(config.apiUrl).toBe('https://custom-api.example.com'); // from 'user' layer
 * expect(config.timeout).toBe(3000); // from 'env' layer
 * expect(config.nonExistentKey).toBeUndefined(); // warns, and resolves to undefined
 * ```
 *
 * **Using for i18n**
 *
 * ```ts
 * type LabelSchema = {}
 * const labels = LayeredConfig.fromLayers<LabelSchema>([
 * {name: 'defaults', config: JSON.parse(fs.readFileSync('labels/en.json','utf-8'))},
 * {name: 'es', config: JSON.parse(fs.readFileSync('labels/es.json','utf-8'))},
 * ]);
 *
 * // print welcome message in Spanish if exists, otherwise in English
 * console.log(labels.welcomeMessage)
 *
 * // print welcome message in Spanish if exists, otherwise in English, otherwise 'Welcome!'
 * console.log(labels('welcomeMessage','Welcome!'));
 *
 * //to inspect where the key came from:
 * console.log(labels.__inspect('welcomeMessage'));
 *
 * ```
 */
export class LayeredConfig<Schema extends Record<string | symbol, any> = Record<string, any>> {

    private layers: Map<LayerName, DeepOptionalAndUndefined<Schema>>;

    private flattened: DeepOptionalAndUndefined<Schema>;

    /**
     * The top-level keys the handle reports. Computed once during construction - the layer set is
     * fixed for an instance's lifetime, and the instance is frozen straight afterwards, so this
     * cannot be filled in lazily.
     *
     * Read off the merged result rather than rescanned from the layers: `flattened` already has
     * them folded together under the same `acceptNull` / `acceptUndefined` rules, so the keys the
     * handle reports and the values it resolves can never disagree.
     */
    private ownKeys: Array<string | symbol>;

    private constructor(
        layers: Map<LayerName, DeepOptionalAndUndefined<Schema>>,
        options: Partial<ConfigOptions> | undefined = undefined,
    ) {
        this.layers = layers;

        this.options = {
            ...{
                // Warns once per key and resolves to `undefined` rather than throwing. A missing
                // config key is usually a typo or a layer that did not load, and taking down the
                // caller for it is rarely what you want - but it should not pass silently either.
                // Pass your own `notFoundHandler` to throw, route to a logger, or supply a default.
                notFoundHandler: createDefaultNotFoundHandler(),
                freeze: true,
                acceptNull: false,
                acceptUndefined: false,
            },
            ...options ?? {}
        };

        this.flattened = Array.from(this.layers.values()).reduce((acc, layer) => {
            return deepMerge(acc, layer, this.options);
        }, {} as DeepOptionalAndUndefined<Schema>);

        // The fold leaves arrays shared with the caller's layers. Take ownership of them - and
        // freeze the result if asked - in one pass over what actually survived the merge.
        finalizeOwned(this.flattened as object, this.options.freeze);

        this.ownKeys = Object.keys(this.flattened as object);
    }

    private options: ConfigOptions;


    /**
     * Creates an instance of LayeredConfig from an array of layer objects.
     *
     * @param layers - The configuration layers to merge.
     * @param options - Optional settings for the instance.
     * @param options.notFoundHandler - Custom handler for not found keys.
     * @returns LayeredConfig following the Schema
     *
     * Check `LayeredConfig` class documentation for usage example.
     * @see LayeredConfig
     *
     */
    public static fromLayers<Schema extends Record<string | symbol, any> = Record<string, any>>(
        layers: Array<{ name: LayerName, config: DeepOptionalAndUndefined<Schema> }>,
        options?: Partial<ConfigOptions>
    ) {

        const instance = new LayeredConfig<Schema>(
            new Map(layers.map(l => [l.name, l.config])),
            options
        );

        if (instance.options.freeze) {
            // Deliberately not `deepFreeze(instance)`: that would walk into `layers`, whose values
            // are the caller's own objects. `flattened` was already frozen by finalizeOwned, so
            // only the instance's remaining fields are left.
            Object.freeze(instance.options);
            Object.freeze(instance.ownKeys);
            Object.freeze(instance);
        }


        // noinspection JSUnusedGlobalSymbols
        return new Proxy(() => {
        }, {
            apply(_target, _this, argArray: [string, string]): any {
                const [key, fallback] = argArray;
                return instance.__withFallback(key, fallback);
            },
            has(_target, key) {
                const val = instance.__resolve(key, isString(key) ? splitPath(key) : [key], undefined, true);
                return val !== undefined && (val !== null || !!instance.options.acceptNull);
            },
            getOwnPropertyDescriptor(_target, prop) {
                // Must carry the actual value. Returning a descriptor without one made every tool
                // that reads through descriptors rather than [[Get]] - `Object.getOwnPropertyDescriptors`,
                // deep-equality helpers, some formatters - see `undefined` for every key.
                //
                // `configurable` has to stay true: reporting a non-configurable property that the
                // target does not have is a proxy invariant violation and throws.
                if (typeof prop === 'string' && hasOwn.call(instance.flattened, prop)) {
                    return {
                        value: (instance.flattened as any)[prop],
                        writable: false,
                        enumerable: true,
                        configurable: true,
                    };
                }
                return Reflect.getOwnPropertyDescriptor(_target, prop);
            },
            deleteProperty(_target, _prop) {
                return false;
            },
            set() {
                return false;
            },
            defineProperty() {
                return false;
            },
            ownKeys(): Array<string | symbol> {
                // The layer set is fixed for the lifetime of an instance, so this is computed once
                // rather than rescanning every layer on each Object.keys / spread / for...in.
                return instance.__ownKeys();
            },
            get(_target, key: string | symbol, _receiver) {

                if (key === '__inspect') {
                    return instance.__inspect.bind(instance);
                }
                if (key === '__derive') {
                    return instance.__derive.bind(instance);
                }
                if(key==='getAll'){
                    return instance.__getAll.bind(instance);
                }

                // Protocol lookups. The language itself, `JSON.stringify`, `console.log` and a
                // fair number of libraries probe these on any object handed to them. None of them
                // is a config key, so a miss has to answer quietly - routing them to
                // notFoundHandler is why `console.log(config)` and `String(config)` used to throw.
                if (typeof key === 'symbol') {
                    if (key === Symbol.toStringTag) return 'LayeredConfig';
                    // Symbol.toPrimitive, Symbol.iterator, Symbol.hasInstance and friends: a
                    // symbol can never name a config key here, since the merge walks string keys.
                    //
                    // Note there is deliberately no `nodejs.util.inspect.custom` branch: Node
                    // detects a proxy and inspects its target directly without running any trap,
                    // so `console.log(config)` shows the underlying function no matter what is
                    // returned here. Use `config.toJSON()` to log the resolved config.
                    return undefined;
                }

                if (!hasOwn.call(instance.flattened, key)) {
                    // The handle is callable, so `typeof config === 'function'` and anything doing
                    // function-shaped introspection - assertion libraries, loggers, DI containers -
                    // reads `name` and `length` off it. Answer from the target rather than treating
                    // them as missing config keys.
                    if (hasOwn.call(_target, key)) return (_target as any)[key];

                    // Duck-typing sentinels. `$$`-prefixed (React's `$$typeof`) and `@@`-wrapped
                    // (`@@__IMMUTABLE_ITERABLE__@@`, transducer protocols) names are probes by
                    // convention, never config keys - anything that formats or inspects a value
                    // reads a handful of them off it. Note this only applies to keys the config
                    // does not define, so a layer with a real `$$foo` key still resolves.
                    if (key.startsWith('$$') || key.startsWith('@@')) return undefined;

                    switch (key) {
                        // `await config` must not treat the handle as a thenable
                        case 'then':
                            return undefined;
                        case 'toJSON':
                            return () => instance.flattened;
                        case 'toString':
                        case 'valueOf':
                            return () => '[object LayeredConfig]';
                        case 'constructor':
                        case 'nodeType':
                            return undefined;
                    }
                }

                return instance.__resolve(key, isString(key) ? splitPath(key) : [key]);
            }
        }) as unknown as ConfigHandle<Schema>;
    }

    public static async fromLayersAsync<Schema extends Record<string | symbol, any>>(
    layers: Array<{
        name: LayerName,
        config: Promise<DeepOptionalAndUndefined<Schema>> | DeepOptionalAndUndefined<Schema>
    }>,
    options?: Partial<ConfigOptions>
    ): Promise<ConfigHandle<Schema>> {
        const resolved = await Promise.all(
            layers.map(async l => ({ name: l.name, config: await l.config }))
        );
        return LayeredConfig.fromLayers<Schema>(resolved, options);
    }

    private __withFallback<K extends keyof Schema, T>(key: K | number | symbol, fallback: T): T | Partial<Schema> {
        return this.__resolve(key, isString(key) ? splitPath(key) : [key], fallback);
    }


    private __derive(name: string, layer: Partial<Schema>): ConfigHandle<Schema>;
    private __derive(name: string, layer: Partial<Schema>, opts: Partial<ConfigOptions>): ConfigHandle<Schema>;
    private __derive(opts: Partial<ConfigOptions>): ConfigHandle<Schema>;

    private __derive(
        nameOrOpts: string | Partial<ConfigOptions>,
        layer?: DeepOptionalAndUndefined<Schema>,
        opts?: Partial<ConfigOptions>
    ): ConfigHandle<Schema> {

        // A Map copy, not a plain-object round-trip. Going through an object lost symbol-named
        // layers entirely (`Object.entries` skips symbols) and silently reordered numeric-looking
        // names like '2024' to the front, which inverted their precedence.
        const newLayers = new Map(this.layers);

        // Called with options only.
        if (typeof nameOrOpts === 'object' && layer === undefined) {
            return LayeredConfig.fromLayers(__layerList(newLayers), Object.assign({}, this.options, nameOrOpts));
        }

        // Called with a layer to add or replace. Setting an existing key on a Map updates it in
        // place and keeps its original position, so replacing a layer does not change precedence.
        if (typeof nameOrOpts === 'string' && layer !== undefined) {
            newLayers.set(nameOrOpts, layer);
        }

        return LayeredConfig.fromLayers(__layerList(newLayers), Object.assign({}, this.options, opts ?? {}));
    }


    private __ownKeys(): Array<string | symbol> {
        return this.ownKeys;
    }

    private __getAll<K extends keyof Schema>(key: K|number|symbol){
        //iterate over all layers in precedence order and collect values for the key
        const treeKeyParts = isString(key) ? splitPath(key) : [key];

        const layers = Array.from(this.layers.entries()).reverse() as Array<[LayerName, Partial<Schema>]>;

        const results: Array<{layer: LayerName, value: any}> = [];

        for(const [layerName, layer] of layers){
            if(!layer) continue;

            let currentLayer: any = layer;
            let found = true;
            //For each part of the key, try to nest into the object
            for (const part of treeKeyParts) {
                //execute nesting into the subtree
                if (currentLayer && part in currentLayer) {
                    currentLayer = currentLayer[part];
                } else {
                    found = false;
                    break;
                }
            }
            if(found){
                if (currentLayer === null && !this.options.acceptNull) continue;
                if (currentLayer === undefined && !this.options.acceptUndefined) continue;
                results.push({layer: layerName, value: currentLayer});
            }
        }
        return results;
    }

    /**
     * Resolves a key path against the merged config.
     *
     * Both flat and dotted access come through here. They used to be separate: flat access read
     * `flattened`, while dotted access re-walked the raw layers with its own merge. The two
     * disagreed - the layer walk iterated highest-priority-first and shallow-spread each match, so
     * lower layers overwrote higher ones and nested objects never merged past one level, and it
     * could not see array merge strategies at all. One resolver, one answer.
     *
     * Steps are matched as own properties. A config path addresses data the layers put there, so
     * it must not be able to walk onto `Object.prototype` and pull out `constructor` or `toString`.
     */
    private __resolve<K extends keyof Schema>(
        key: K | number | symbol,
        parts: readonly (string | symbol | number)[],
        fallback?: unknown,
        silent: boolean = false,
    ) {
        // Single-segment keys are by far the most common read, so they skip the loop entirely.
        if (parts.length === 1) {
            const only = parts[0] as any;
            if (!hasOwn.call(this.flattened, only)) return this.__miss(key, fallback, silent);
            const value = (this.flattened as any)[only];
            if (value === undefined && !this.options.acceptUndefined) {
                return this.__miss(key, fallback, silent);
            }
            return value;
        }

        // `flattened` is always an object, so the container check is only needed before a *next*
        // step.
        let current: any = this.flattened;

        for (let i = 0; i < parts.length; i++) {
            if (!hasOwn.call(current, parts[i] as any)) {
                return this.__miss(key, fallback, silent);
            }
            current = current[parts[i] as any];

            if (i + 1 < parts.length && (current === null || typeof current !== 'object')) {
                return this.__miss(key, fallback, silent);
            }
        }

        // `flattened` only ever holds an explicit `undefined` when acceptUndefined is on, since
        // deepMerge skips them otherwise - so reaching one here means it was asked for.
        if (current === undefined && !this.options.acceptUndefined) {
            return this.__miss(key, fallback, silent);
        }

        return current;
    }

    /** What a resolution that found nothing returns: the fallback, silence, or the handler. */
    private __miss<K extends keyof Schema>(key: K | number | symbol, fallback: unknown, silent: boolean) {
        if (fallback !== undefined) return fallback;
        if (silent) return undefined;
        return this.options.notFoundHandler(key);
    }

    /**
     * Inspects a configuration key, providing details about its value and source across layers.
     *
     * @param key - The configuration key to inspect.
     * @returns An object containing inspection results, including the resolved value and layer details.
     */
    public __inspect<K extends keyof Schema>(key: K | string): ConfigInspectionResult<Schema, Schema[K]> {
        const result: ConfigInspectionResult<Schema, Schema[K]> = {
            key,
            resolved: {
                value: undefined,
                source: '',
            },
            layers: [],
        };
        const keyParts = isString(key) ? splitPath(key) : [key];
        const precedence = Array.from(this.layers.keys()).reverse() as LayerName[];

        if (keyParts.length < 1) {
            return {
                key,
                resolved: {
                    value: undefined,
                    source: '',
                },
                layers: precedence.map(layer => ({
                    layer: layer as LayerName,
                    value: undefined,
                    isPresent: false,
                    isActive: false,
                })),
            }
        }

        if (keyParts.length === 1) {
            let found: boolean = false;
            for (const layerName of precedence) {

                const layer = this.layers.get(layerName);
                let isPresent = !!(layer && (key in layer));
                const value = isPresent ? layer?.[key as K] : undefined;

                if (isPresent) {
                    if (value === null && !this.options.acceptNull) isPresent = false;
                    if (value === undefined && !this.options.acceptUndefined) isPresent = false;
                }

                //set found to true only for first occurance, not for any subsequent ones
                const isActive = isPresent ? !found : false;

                result.layers.push({
                    layer: layerName as LayerName,
                    value: isPresent ? value : undefined,
                    isPresent: isPresent,
                    isActive: isActive,
                });

                if (isActive && !found) {
                    result.resolved.value = value;
                    result.resolved.source = layerName;
                    found = true;
                }
            }
        }

        if (keyParts.length > 1) {
            for (const layer of precedence) {
                let current: DeepOptionalAndUndefined<Schema> | undefined = this.layers.get(layer);
                if (!current)
                    continue;

                let found = true;
                for (const part of keyParts) {
                    if (current && typeof current === "object" && part in current) {
                        current = current[part] as Partial<Schema>;
                    } else {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    if (current === null && !this.options.acceptNull) found = false;
                    if (current === undefined && !this.options.acceptUndefined) found = false;
                }

                if (!found)
                    current = undefined;
                const isActive = found && result.resolved.value === undefined;
                result.layers.push({
                    layer: layer as LayerName,
                    value: found ? current : undefined,
                    isPresent: found,
                    isActive: isActive,
                })
                if (isActive) {
                    result.resolved.value = current as Schema[K];
                    result.resolved.source = layer as LayerName;
                }
            }
        }
        return result;
    }
}

// in-source test suites
// @ts-expect-error vitest augments import.meta only while its own types are loaded
if (import.meta.vitest) {
// @ts-expect-error same: import.meta.vitest is untyped in the library's own tsconfig
    const {describe, it, expect} = import.meta.vitest;
    describe('splitPath', () => {
        it('should split on single dots', () => {
            expect(splitPath('a.b.c')).toEqual(['a', 'b', 'c']);
        });
        it('should not split on double dots', () => {
            expect(splitPath('special..name')).toEqual(['special.name']);
            expect(splitPath('a..b.c')).toEqual(['a.b', 'c']);
        });
        it('should handle triple dots as two splits', () => {
            expect(splitPath('a...b.c')).toEqual(['a..b', 'c']);
        });
        it('should return the whole string if no dots', () => {
            expect(splitPath('abc')).toEqual(['abc']);
        });
        it('should handle leading dot', () => {
            expect(splitPath('.a.b')).toEqual(['', 'a', 'b']);
        });
        it('should handle trailing dot', () => {
            expect(splitPath('a.b.')).toEqual(['a', 'b', '']);
        });
        it('should handle only dots', () => {
            expect(splitPath('..')).toEqual(['.']);
            expect(splitPath('...')).toEqual(['..']);
            expect(splitPath('....')).toEqual(['...']);
        });
        it('should handle empty string', () => {
            expect(splitPath('')).toEqual(['']);
        });
        it('should handle consecutive double dots', () => {
            expect(splitPath('a..b..c')).toEqual(['a.b.c']);
        });
        it('should handle mixed single and double dots', () => {
            expect(splitPath('a.b..c.d')).toEqual(['a', 'b.c', 'd']);
        });
    });

    describe('LayeredConfig', () => {
        it('should return undefined for "then" to support async/await', () => {
            const config = LayeredConfig.fromLayers([]);
            expect(config.then).toBeUndefined();
        });
    });
}
