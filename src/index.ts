import type {
    LayerName,
    ConfigInspectionResult,
    ConfigOptions,
    ConfigHandle, DeepOptionalAndUndefined,
} from "./types";

export type {LayerName, ConfigInspectionResult, ConfigOptions, ConfigHandle, DeepOptionalAndUndefined};


function isString(key: string | symbol | number) {
    return typeof key === 'string';
}

function splitDotExceptDouble(str: string): string[] {
    // Split on '.' not preceded or followed by another '.'
    return str.split(/(?<!\.)\.(?!\.)/).map(part=>{
        //and remove the additional dot from the doubled parts
        return part.replace(/\.{2,}/gu, match=>match.slice(1));
    });
}

function deepMerge<T extends object, U extends object>(target: T, source: U, options?: Partial<ConfigOptions>): T & U {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const value = source[key];
            if (value === null && !options?.acceptNull) continue;
            if (value === undefined && !options?.acceptUndefined) continue;

            if (
                typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value)
            ) {
                if (!(key in target)) {
                    (target as any)[key] = {};
                }
                deepMerge((target as any)[key], value as object, options);
            } else {
                (target as any)[key] = value;
            }
        }
    }
    return target as T & U;
}

function deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
        Object.getOwnPropertyNames(obj).forEach((prop) => {
            const value = (obj as any)[prop];
            if (value && typeof value === "object") {
                deepFreeze(value);
            }
        });
        Object.freeze(obj);
    }
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
export class LayeredConfig<Schema extends Record<string | symbol, any> = Record<string, any>> {

    private layers: Map<LayerName, DeepOptionalAndUndefined<Schema>>;

    private flattened: DeepOptionalAndUndefined<Schema>;

    private constructor(
        layers: Map<LayerName, DeepOptionalAndUndefined<Schema>>,
        options: Partial<ConfigOptions> | undefined = undefined,
    ) {
        this.layers = layers;

        this.options = {
            ...{
                notFoundHandler: (key) => {
                    throw new Error(`Key not found: ${String(key)}`);
                },
                freeze: true,
                acceptNull: false,
                acceptUndefined: false,
            },
            ...options ?? {}
        };

        this.flattened = Array.from(this.layers.values()).reduce((acc, layer) => {
            return deepMerge(acc, layer, this.options);
        }, {} as DeepOptionalAndUndefined<Schema>);
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

        if(instance.options.freeze)
            deepFreeze(instance);


        // noinspection JSUnusedGlobalSymbols
        return new Proxy(() => {
        }, {
            apply(_target, _this, argArray: [string, string]): any {
                const [key, fallback] = argArray;
                return instance.__withFallback(key, fallback);
            },
            has(_target, key) {
                const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
                if (treeKeyParts.length == 1) {
                    const val = instance.__getFlat(treeKeyParts[0], undefined, true);
                    return val !== undefined && (val !== null || !!instance.options.acceptNull);
                }
                if (treeKeyParts.length > 1) {
                    const val = instance.__getComplex(key, undefined, true);
                    return val !== undefined && (val !== null || !!instance.options.acceptNull);
                }
                return false;
            },
            getOwnPropertyDescriptor(_target, _prop) {
                return {
                    enumerable: true,
                    configurable: true
                };
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
                const layers = Array.from(instance.layers.values());
                const keys = new Set<string | symbol>();
                for (const layer of layers) {
                    for (const key in layer) {
                        if (Object.prototype.hasOwnProperty.call(layer, key)) {
                            const value = (layer as any)[key];
                            if (value === null && !instance.options.acceptNull) continue;
                            if (value === undefined && !instance.options.acceptUndefined) continue;
                            keys.add(key);
                        }
                    }
                }
                const keysArray = Array.from(keys);
                return {...keysArray, length: keysArray.length};
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

                if (key === 'then' && (instance.flattened as any)['then'] === undefined) {
                    return undefined;
                }

                const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];

                if (treeKeyParts.length == 1) {
                    return instance.__getFlat(treeKeyParts[0]);
                }
                if (treeKeyParts.length > 1) {
                    return instance.__getComplex(key);
                }
            }
        }) as unknown as ConfigHandle<Schema>;
    }

    private __withFallback<K extends keyof Schema, T>(key: K | number | symbol, fallback: T): T | Partial<Schema> {
        const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
        if (treeKeyParts.length == 1) {
            return this.__getFlat(treeKeyParts[0], fallback);
        }

        return this.__getComplex(key, fallback);

    }


    private __derive(name: string, layer: Partial<Schema>): ConfigHandle<Schema>;
    private __derive(name: string, layer: Partial<Schema>, opts: Partial<ConfigOptions>): ConfigHandle<Schema>;
    private __derive(opts: Partial<ConfigOptions>): ConfigHandle<Schema>;

    private __derive(
        nameOrOpts: string | Partial<ConfigOptions>,
        layer?: DeepOptionalAndUndefined<Schema>,
        opts?: Partial<ConfigOptions>
    ): ConfigHandle<Schema> {

        const newLayers = Array.from(this.layers.entries())
            .reduce(
                (acc, [name, layer]) => {
                    acc[name] = layer;
                    return acc;
                }, {} as Record<LayerName, DeepOptionalAndUndefined<Schema>>);

        if (typeof nameOrOpts === 'object' && layer === undefined) {
            // called with opts only

            const newOpts: ConfigOptions = Object.assign({}, this.options, nameOrOpts)

            return LayeredConfig.fromLayers(
                Object.entries(newLayers).map(([name, config]) => ({name, config})),
                newOpts
            );

        }

        if (typeof nameOrOpts === 'string' && layer !== undefined) {
            newLayers[nameOrOpts] = layer;

            return LayeredConfig.fromLayers(
                Object.entries(newLayers).map(([name, config]) => ({name, config})),
                Object.assign({}, this.options, opts ?? {})
            );
        }

        return LayeredConfig.fromLayers(
            Object.entries(newLayers)
                .map(([name, config]) => ({name, config})),
            Object.assign({}, this.options, opts ?? {})
        )

    }


    private __getAll<K extends keyof Schema>(key: K|number|symbol){
        //iterate over all layers in precedence order and collect values for the key
        const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];

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

    private __getComplex<K extends keyof Schema>(key: K | number | symbol, fallback?: unknown, silent: boolean = false) {

        const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];

        const layers = Array.from(this.layers.values()).reverse();

        let resultingObject: any = {};

        let current: any = undefined;
        let isFinalValueFound = false;
        //execute for each layer
        for (const layer of layers) {

            if (!layer) continue;

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

            if (found) {
                if (currentLayer === null && !this.options.acceptNull) continue;
                if (currentLayer === undefined && !this.options.acceptUndefined) continue;

                //if we have a plain value, return it, this is our value
                if (typeof currentLayer != 'object' || currentLayer === null) {
                    current = currentLayer;
                    isFinalValueFound = true;
                    break;
                } else {
                    //we have an object, merge it into the resulting object
                    current = undefined;
                    resultingObject = {
                        ...resultingObject,
                        ...currentLayer
                    }
                }
            }
        }
        if (isFinalValueFound) {
            return current;
        }
        if (Object.keys(resultingObject).length > 0) {
            return resultingObject;
        }
        if (fallback !== undefined)
            return fallback;
        if (silent) return undefined;
        return this.options.notFoundHandler(key);
    }

    private __getFlat<K extends keyof Schema>(key: K | number | symbol, fallback?: unknown, silent: boolean = false) {
        const value = this.flattened[key as K];
        if (value !== undefined || (key in this.flattened && this.options.acceptUndefined))
            return value;
        if (fallback !== undefined)
            return fallback;
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
        const keyParts = isString(key) ? splitDotExceptDouble(key) : [key];
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

        if (keyParts.length == 1) {
            let found: boolean = false;
            for (const layerName of precedence) {

                const layer = this.layers.get(layerName);
                let isPresent = !!(layer && (key in layer));
                let value = isPresent ? layer?.[key as K] : undefined;

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
// @ts-ignore
if (import.meta.vitest) {
// @ts-ignore
    const {describe, it, expect} = import.meta.vitest;
    describe('splitDotExceptDouble', () => {
        it('should split on single dots', () => {
            expect(splitDotExceptDouble('a.b.c')).toEqual(['a', 'b', 'c']);
        });
        it('should not split on double dots', () => {
            expect(splitDotExceptDouble('special..name')).toEqual(['special.name']);
            expect(splitDotExceptDouble('a..b.c')).toEqual(['a.b', 'c']);
        });
        it('should handle triple dots as two splits', () => {
            expect(splitDotExceptDouble('a...b.c')).toEqual(['a..b', 'c']);
        });
        it('should return the whole string if no dots', () => {
            expect(splitDotExceptDouble('abc')).toEqual(['abc']);
        });
        it('should handle leading dot', () => {
            expect(splitDotExceptDouble('.a.b')).toEqual(['', 'a', 'b']);
        });
        it('should handle trailing dot', () => {
            expect(splitDotExceptDouble('a.b.')).toEqual(['a', 'b', '']);
        });
        it('should handle only dots', () => {
            expect(splitDotExceptDouble('..')).toEqual(['.']);
            expect(splitDotExceptDouble('...')).toEqual(['..']);
            expect(splitDotExceptDouble('....')).toEqual(['...']);
        });
        it('should handle empty string', () => {
            expect(splitDotExceptDouble('')).toEqual(['']);
        });
        it('should handle consecutive double dots', () => {
            expect(splitDotExceptDouble('a..b..c')).toEqual(['a.b.c']);
        });
        it('should handle mixed single and double dots', () => {
            expect(splitDotExceptDouble('a.b..c.d')).toEqual(['a', 'b.c', 'd']);
        });
    });

    describe('LayeredConfig', () => {
        it('should return undefined for "then" to support async/await', () => {
            const config = LayeredConfig.fromLayers([]);
            // @ts-ignore
            expect(config.then).toBeUndefined();
        });
    });
}
