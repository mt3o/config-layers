/**
 * Represents the name of a configuration layer.
 */
type LayerName = string | symbol;
/**
 * The result of inspecting a configuration key, including its resolved value, source layer, and per-layer details.
 */
interface ConfigInspectionResult<Schema, T> {
    key: string | symbol | keyof Schema;
    resolved: {
        value: T | undefined | Partial<Schema>;
        source: LayerName;
    };
    layers: Array<{
        layer: LayerName;
        value: T | undefined | Partial<Schema>;
        isPresent: boolean;
        isActive: boolean;
    }>;
}
/**
 * A handler function for retrieving a config value with a fallback.
 */
type WithHandler<Schema> = <K extends keyof Schema, T>(name: K | symbol | number, fallback?: T) => T;
/**
 * An interface for inspecting the source and value of a config key.
 */
type WithInspect<Schema> = {
    __inspect: <K extends keyof Schema>(key: K | string | number) => ConfigInspectionResult<Schema, Schema[K]>;
};
/**
 * A function called when a config key is not found.
 */
type NotFoundHandler = (key: string | symbol | number) => any;
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
 * expect(()=>config.nonExistentKey).toThrow(); // throws error
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
 * // print welcome message in Spanish if exists, otherwise in English, otherwise 'Welcome!'
 * console.log(labels('welcomeMessage','Welcome!'))
 *
 * ```
 */
export declare class LayeredConfig<Schema extends Record<string | symbol, any> = Record<string, any>> {
    private layers;
    private constructor();
    private notFoundHandler;
    /**
     * Creates an instance of LayeredConfig from an array of layer objects.
     *
     * @param layers - The configuration layers to merge.
     * @param options - Optional settings for the instance.
     * @param options.notFoundHandler - Custom handler for not found keys.
     * @returns LayeredConfig following the Schema
     *
     * Check `LayeredConfig` class documentation for usage example.
     *
     */
    static fromLayers<Schema extends Record<string | symbol, any> = Record<string, any>>(layers: Array<{
        name: LayerName;
        config: Partial<Schema>;
    }>, options?: {
        notFoundHandler?: NotFoundHandler;
    }): Schema & WithInspect<Schema> & WithHandler<Schema>;
    private __withFallback;
    private __getComplex;
    private __getFlat;
    /**
     * Inspects a configuration key, providing details about its value and source across layers.
     *
     * @param key - The configuration key to inspect.
     * @returns An object containing inspection results, including the resolved value and layer details.
     */
    __inspect<K extends keyof Schema>(key: K | string): ConfigInspectionResult<Schema, Schema[K]>;
}
export {};
//# sourceMappingURL=index.d.ts.map