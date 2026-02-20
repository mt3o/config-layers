/**
 * Represents the name of a configuration layer.
 * @typedef {string | symbol} LayerName
 */
export type LayerName = string | symbol;
/**
 * A utility type for objects that are not arrays.
 */
type NonArrayObject = {
    [key: string]: any;
};
/**
 * Recursively makes all properties optional and allows 'undefined' or 'null'.
 * This infers which properties are nested objects (excluding arrays) and applies
 * the deep logic only to them.
 * @template T
 */
export type DeepOptionalAndUndefined<T> = {
    [P in keyof T]?: T[P] extends (infer _U)[] ? T[P] : T[P] extends NonArrayObject ? DeepOptionalAndUndefined<T[P]> | undefined | null : T[P] | undefined | null;
};
/**
 * The result of inspecting a configuration key.
 * Contains the resolved value, the source layer, and historical data from all layers.
 * @template Schema The base configuration schema.
 * @template T The type of the specific key being inspected.
 */
export interface ConfigInspectionResult<Schema, T> {
    key: string | symbol | keyof Schema;
    resolved: {
        value: T | undefined | null | DeepOptionalAndUndefined<Schema>;
        source: LayerName;
    };
    layers: Array<{
        layer: LayerName;
        value: T | undefined | null | DeepOptionalAndUndefined<Schema>;
        isPresent: boolean;
        isActive: boolean;
    }>;
}
/**
 * A handler function for retrieving a config value with a fallback.
 * @template Schema
 */
export type WithHandler<Schema> = 
/**
 * @template {keyof Schema} K
 * @template T
 * @param {K | symbol | number} name The configuration key.
 * @param {T} [fallback] A value to return if the key is not found.
 * @returns {T}
 */
<K extends keyof Schema, T>(name: K | symbol | number, fallback?: T) => T;
/**
 * An interface for inspecting the source and value of a config key.
 * @template Schema
 */
export type WithInspect<Schema> = {
    /**
     * Inspects a specific key to see its resolution path across layers.
     * @template {keyof Schema} K
     * @param {K | string | number} key
     * @returns {ConfigInspectionResult<Schema, Schema[K]>}
     */
    __inspect: <K extends keyof Schema>(key: K | string | number) => ConfigInspectionResult<Schema, Schema[K]>;
};
/**
 * Interface for retrieving all values associated with a config key across all layers.
 * @template Schema
 */
export type WithGetAll<Schema> = {
    /**
     * @template {keyof Schema} K
     * @param {K | string | number} key
     * @returns {Array<{ layer: LayerName, value: Schema[K] | undefined | Partial<Schema> }>}
     */
    getAll: <K extends keyof Schema>(key: K | string | number) => Array<{
        layer: LayerName;
        value: Schema[K] | undefined | Partial<Schema>;
    }>;
};
export type ConfigOptions = {
    /** A function called when a requested key does not exist in any layer. */
    notFoundHandler: NotFoundHandler;
    /**
     * Specifies whether the derived configuration should be frozen (immutable). If not set or set to true,
     * the default behavior is to freeze the configuration.
     */
    freeze: boolean;
    /**
     * Specifies whether `null` values should be treated as valid configuration values.
     * If `false` (default), `null` is treated as a missing value - like a key that does not exist.
     * If `true`, `null` values are considered valid and will be included in the effective configuration.
     */
    acceptNull?: boolean;
    /**
     * Specifies whether `undefined` values should be treated as valid configuration values.
     * If `false` (default), `undefined` is treated as a missing value - like a key that does not exist.
     * If `true`, `undefined` values are considered valid and will be included in the effective configuration.
     */
    acceptUndefined?: boolean;
};
/**
 * An interface for deriving new LayeredConfig instances by adding or overriding layers.
 * @template {Record<string | symbol, any>} Schema
 */
export type WithDerive<Schema extends Record<string | symbol, any> = Record<string, any>> = {
    /**
     * Creates a new configuration handle by adding a layer or changing options.
     */
    __derive: {
        (opts: Partial<ConfigOptions>): ConfigHandle<Schema>;
        (name: string, layer: Partial<Schema>): ConfigHandle<Schema>;
        (name: string, layer: Partial<Schema>, opts: Partial<ConfigOptions>): ConfigHandle<Schema>;
    };
};
/**
 * A function called when a config key is not found.
 */
export type NotFoundHandler = (key: string | symbol | number) => any;
/**
 * The primary Configuration Handle.
 * This type merges your custom **Schema** properties from multiple layers, directly onto the single object,
 * while providing a clean interface and internal methods to manage the layers.
 *
 * It can be used in two ways:
 * 1.  **As an object:** Directly access configuration properties as defined in your `Schema`.
 *     Nested properties can be accessed using dot notation if supported by the schema.
 * 2.  **As a function:** Call the handle directly with a key and an optional fallback value.
 *     `config('some.key', 'fallback')`
 *
 * Internal methods (prefixed with `__` or specific like `getAll`) allow for advanced operations:
 * - `__inspect(key)`: Returns detailed information about how a key's value was resolved across all layers.
 * - `__derive(...)`: Creates a new `ConfigHandle` by adding/overriding layers or changing options.
 * - `getAll(key)`: Returns an array of all values for a given key from all layers where it is present.
 *
 * @template {Record<string | symbol, any>} [Schema=Record<string, any>]
 * @example
 * ```ts
 * interface MySchema { port: number; api: { host: string } }
 * const config = LayeredConfig.fromLayers<MySchema>([
 *   { name: 'default', config: { port: 8080, api: { host: 'localhost' } } }
 * ]);
 *
 * // Property access
 * const port = config.port;
 *
 * // Function call access with fallback
 * const host = config('api.host', '127.0.0.1');
 *
 * // Inspection
 * const report = config.__inspect('port');
 * ```
 */
export type ConfigHandle<Schema extends Record<string | symbol, any> = Record<string, any>> = Schema & WithInspect<Schema> & WithHandler<Schema> & WithDerive<Schema> & WithGetAll<Schema>;
export {};
//# sourceMappingURL=types.d.ts.map