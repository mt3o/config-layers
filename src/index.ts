import type {
    LayerName,
    ConfigInspectionResult,
    ConfigOptions,
    NotFoundHandler,
    ConfigHandle,
} from "./types";

function isString(key: string | symbol | number) {
    return typeof key === 'string';
}

function splitDotExceptDouble(str: string): string[] {
    // Split on '.' not preceded or followed by another '.'
    return str.split(/(?<!\.)\.(?!\.)/);
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

    private layers: Map<LayerName, Partial<Schema>>;

    private constructor(
        layers: Map<LayerName, Partial<Schema>>,
    ) {
        this.layers = layers;
    }


    private notFoundHandler: NotFoundHandler = (key) => {
        throw new Error(`Key not found: ${String(key)}`);
    };

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
        layers: Array<{ name: LayerName, config: Partial<Schema> }>,
        options?: ConfigOptions
    ) {
        const instance = new LayeredConfig<Schema>(
            new Map(layers.map(l => [l.name, l.config]))
        );

        if (options?.notFoundHandler) {
            instance.notFoundHandler = options.notFoundHandler;
        }


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
                    return instance.__getFlat(key) !== undefined;
                }
                if (treeKeyParts.length > 1) {
                    return instance.__getComplex(key) !== undefined;
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
                const allKeys = layers.map(l => Object.keys(l));
                const keys = Array.from(
                    new Set(allKeys.flat())
                );
                return {...keys, length: keys.length};
            },
            get(_target, key: string | symbol, _receiver) {

                if (key === '__inspect') {
                    return instance.__inspect.bind(instance);
                }
                if (key === '__derive') {
                    return instance.__derive.bind(instance);
                }

                const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];

                if (treeKeyParts.length == 1) {
                    return instance.__getFlat(key);
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
            return this.__getFlat(key, fallback);
        }

        return this.__getComplex(key, fallback);

    }



    private __derive(name: string, layer: Partial<Schema>): ConfigHandle<Schema>;
    private __derive(name: string, layer: Partial<Schema>,opts:ConfigOptions): ConfigHandle<Schema>;
    private __derive(opts:ConfigOptions): ConfigHandle<Schema>;

    private __derive(nameOrOpts: string | ConfigOptions, layer?: Partial<Schema>, opts?:ConfigOptions): ConfigHandle<Schema> {

        const newLayers = Array.from(this.layers.entries())
            .reduce(
                (acc, [name, layer])=>{
                    acc[name]=layer;
                    return acc;
                }, {} as Record<LayerName, Partial<Schema>>);

        if (typeof nameOrOpts === 'object' && layer === undefined) {
            // called with opts only

            const newOpts: ConfigOptions = Object.assign({}, {
                notFoundHandler: this.notFoundHandler,
            },nameOrOpts)

            return LayeredConfig.fromLayers(
                Object.entries(newLayers).map(([name, config])=> ({name, config})),
                newOpts
            );

        }

        if (typeof nameOrOpts === 'string' && layer !== undefined) {
            newLayers[nameOrOpts] = layer;

            return LayeredConfig.fromLayers(
                Object.entries(newLayers).map(([name, config]) => ({name, config})),
                Object.assign({}, {
                    notFoundHandler: this.notFoundHandler,
                }, opts ?? {})
            );
        }

        return LayeredConfig.fromLayers(
            Object.entries(newLayers)
                .map(([name, config]) => ({name, config})),
            Object.assign({}, {
                notFoundHandler: this.notFoundHandler,
            }, opts ?? {})
        )

    }


    private __getComplex<K extends keyof Schema>(key: K | number | symbol, fallback?: unknown) {

        const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];

        const layers = Array.from(this.layers.values()).reverse();

        let current: any = undefined;
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
            //if we have something, return it, this is our value
            if (found) {
                current = currentLayer;
                break;
            }
        }
        if (current !== undefined) {
            return current;
        }
        if (fallback)
            return fallback;
        return this.notFoundHandler(key);
    }

    private __getFlat<K extends keyof Schema>(key: K | number | symbol, fallback?: unknown) {
        for (const layer of Array.from(this.layers.values()).reverse()) {
            if (layer && key in layer) {
                return layer[key as K];
            }
        }
        if (fallback)
            return fallback;
        return this.notFoundHandler(key);
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
                const isPresent = !!(layer && (key in layer));
                //set found to true only for first occurance, not for any subsequent ones
                const value = isPresent ? layer?.[key as K] : undefined;
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
                let current: Partial<Schema> | undefined = this.layers.get(layer);
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
                if (!found)
                    current = undefined;
                const isActive = found && current !== undefined;
                result.layers.push({
                    layer: layer as LayerName,
                    value: isActive ? current : undefined,
                    isPresent: found,
                    isActive: isActive && result.resolved.value === undefined,
                })
                if (isActive && result.resolved.value === undefined) {
                    result.resolved.value = current as Schema[K];
                    result.resolved.source = layer as LayerName;
                }
            }
        }
        return result;
    }
}
