/**
 * Represents the name of a configuration layer.
 */
export type LayerName = string | symbol;

/**
 * The result of inspecting a configuration key, including its resolved value, source layer, and per-layer details.
 */
export interface ConfigInspectionResult<Schema, T> {
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
export type WithHandler<Schema> = <K extends keyof Schema, T> (name: K | symbol | number, fallback?: T) => T;

/**
 * An interface for inspecting the source and value of a config key.
 */
export type WithInspect<Schema> = {
    __inspect: <K extends keyof Schema>(key: K | string | number) => ConfigInspectionResult<Schema, Schema[K]>
}


export type ConfigOptions = {
    notFoundHandler: NotFoundHandler
    /**
     * Specifies whether the derived configuration should be frozen (immutable). If not set or set to true,
     * the default behavior is to freeze the configuration.
     */
    freeze: boolean
}

/**
 * An interface for deriving new LayeredConfig instances by adding or overriding layers.
 */
export type WithDerive<Schema extends Record<string | symbol, any> = Record<string, any>> = {
  __derive: {
    (opts: ConfigOptions): ConfigHandle<Schema>;
    (name: string, layer: Partial<Schema>): ConfigHandle<Schema>;
    (name: string, layer: Partial<Schema>, opts: ConfigOptions): ConfigHandle<Schema>;
  }
}

/**
 * A function called when a config key is not found.
 */
export type NotFoundHandler = (key: string | symbol | number) => any;

export type ConfigHandle<Schema  extends Record<string | symbol, any> = Record<string, any>> = Schema
    & WithInspect<Schema>
    & WithHandler<Schema>
    & WithDerive<Schema>
;
