# Config Layers

Unopinionated TypeScript library for managing layered configuration objects with support for inspection, fallbacks, and immutability. Useful for applications that need to merge configuration from multiple sources (e.g., defaults, environment, country, region).

## Features
- Layered configuration merging
- Deep key access (dot notation)
- Fallback values and custom not-found handlers
- Configuration inspection (see which layer a value comes from)
- Immutable config proxy
- TypeScript support

## Installation

```bash
npm install config-layers
```

## Usage


NOTE: Examples use dynamic imports due to [Vitest doctest](https://github.com/ssssota/doc-vitest) limitations.

Feel free to import traditionally or dynamically as shown in the examples.


### Basic Example
```typescript :@import.meta.vitest
//import {LayeredConfig} from 'config-layers';
const {LayeredConfig} = await import('./dist/config-layers.js');

type Schema = {
  apikey: string;
  useMocks: boolean;
  userContext: {
    userId: string;
    roles: string[];
  };
};

const layers = [
  { name: "default", config: { useMocks: false, } },
  { name: "env", config: { apikey: "2137-dev-apikey", useMocks: true } },
  { name: "user", config: { userContext: { userId: "user123", roles: ["admin", "user"] } } },
];

const cfg = LayeredConfig.fromLayers<Schema>(layers);

//It resolves from the highest priority layer
expect(cfg.apikey).toBe('2137-dev-apikey'); // defined only in `env`
expect(cfg.useMocks).toBe(true); // `env` overrides `default` => true
expect(cfg.userContext.userId).toBe('user123'); // compound values are also accepted
```

### Fallbacks and Not Found Handler

The library is suitable for localization or similar use cases. It provides graceful handling of missing keys via fallbacks or a custom not-found handler.

```typescript :@import.meta.vitest
//import {LayeredConfig} from 'config-layers';
const {LayeredConfig} = await import('./dist/config-layers.js');

// Specify the type for the labels
type Labels = { button: string };

const labels = LayeredConfig.fromLayers<Labels>([
  { name: "default", config: { button: "Accept cookies" } },
  { name: "localized", config: { button: "I would like the biscuits, please!" } },
], {
  notFoundHandler: key => `<<${key}>>`,
});

// It returns the value from the highest priority layer
expect(labels.button).toBe('I would like the biscuits, please!');

//The callback notation allows providing a fallback value
expect(labels('button2', 'cookie msg2')).toBe('cookie msg2');

//When there is no fallback, the notFoundHandler is called
expect(labels.button2).toBe('<<button2>>'); 
```

### Inspecting Configuration
```typescript :@import.meta.vitest
//import {LayeredConfig} from 'config-layers';
const {LayeredConfig} = await import('./dist/config-layers.js');

const layers = [
    {name: "default", config: {useMocks: false, envName: "not set", path: "cwd"}},
    {name: "env", config: {envName: "development", apikey: "2137-dev-apikey", useMocks: true}},
    {name: "user", config: {session: "abcd", userContext: {userId: "user123", roles: ["admin", "user"]}}},
];

const cfg = LayeredConfig.fromLayers(layers);


expect(cfg.__inspect('apikey')).toStrictEqual({
   key: 'apikey',
   "layers": [
     {"isActive": false, "isPresent": false,"layer": "user",   "value": undefined,},
     {"isActive": true,  "isPresent": true, "layer": "env",    "value": "2137-dev-apikey",},
     {"isActive": false, "isPresent": false,"layer": "default","value": undefined,},
   ],
   resolved: { source: 'env', value: '2137-dev-apikey' }
 })
```

### Deriving New Configurations with `__derive`

You can create a new configuration by adding or overriding layers, or by changing options (such as the not-found handler), without mutating the original config. This is useful for scenarios like feature toggles, user overrides, or context-specific settings.

#### Usage

```typescript :@import.meta.vitest
const {LayeredConfig} = await import('./dist/config-layers.js');

const base = LayeredConfig.fromLayers([
  { name: 'default', config: { apiUrl: 'https://api.example.com', timeout: 5000 } },
  { name: 'env', config: { timeout: 3000 } },
]);

// Derive a new config with an additional layer
const featureConfig = base.__derive('feature', { apiUrl: 'https://feature-api.example.com' });
expect(featureConfig.apiUrl).toBe('https://feature-api.example.com');
expect(base.apiUrl).toBe('https://api.example.com'); // original is unchanged

// Derive with a custom notFoundHandler
const safeConfig = base.__derive({ notFoundHandler: key => `Missing: ${key}` });
expect(safeConfig.nonexistent).toBe('Missing: nonexistent');

// Combine both: add a layer and set options
const custom = base.__derive('user', { timeout: 1000 }, { notFoundHandler: key => 'N/A' });
expect(custom.timeout).toBe(1000);
expect(custom.nonexistent).toBe('N/A');
```

#### API
- `cfg.__derive(layerName, layerConfig)`: Returns a new config with the given layer added or replaced.
- `cfg.__derive(options)`: Returns a new config with new options (e.g., a custom notFoundHandler).
- `cfg.__derive(layerName, layerConfig, options)`: Returns a new config with both a new/overridden layer and new options.

The original config is never mutated. All derived configs are independent proxies.

Consult the [unit tests](./tests/basic.test.ts) [examples](./examples) folder for more usage patterns.

## API
- `LayeredConfig.fromLayers(layers, options?)`: Create a layered config proxy.
- `cfg.${key}`: Get a value by key.
- `cfg.__inspect(key)`: Inspect the source and value for a key.
- `cfg(key, fallback?)`: Get a value with fallback.

## Testing

This project uses [Vitest](https://vitest.dev/) and [vite-plugin-doctest](https://github.com/egoist/vite-plugin-doctest) for testing and documentation.

Run tests with:
```bash
npm test
```

## Contributing

Contributions are welcome! Please open issues or pull requests for improvements or bug fixes.

## License

Unlicense
