import type { LayerName, ConfigInspectionResult, ConfigOptions, ConfigHandle } from "./types";
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
 *
 * // print welcome message in Spanish if exists, otherwise in English, otherwise 'Welcome!'
 * console.log(labels('welcomeMessage','Welcome!'));
 *
 * //to inspect where the key came from:
 * console.log(labels.__inspect('welcomeMessage'));
 *
 * ```
 */
export declare class LayeredConfig<Schema extends Record<string | symbol, any> = Record<string, any>> {
    private layers;
    private flattened;
    private constructor();
    private options;
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
    static fromLayers<Schema extends Record<string | symbol, any> = Record<string, any>>(layers: Array<{
        name: LayerName;
        config: Partial<Schema>;
    }>, options?: ConfigOptions): ConfigHandle<Schema>;
    private __withFallback;
    private __derive;
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
//# sourceMappingURL=index.d.ts.map