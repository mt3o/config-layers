# Config Layers

Simple TypeScript library for managing complex configuration in your js/ts node/web projects.

# Installation and basic usage

Install via npm:
```bash
npm install config-layers
```

Then define your config schema, and you can load and merge multiple configuration layers.
```ts
import {LayeredConfig} from 'config-layers';

type Schema = {  apikey: string; backendUrl: string };
```
Having defined the config schema, you can load the config and use it in your application:
```ts
export const config = LayeredConfig.fromLayers<Schema>([
  { name: "default", config: JSON.parse(fs.readFileSync('config/default.json', 'utf-8')) },
  { name: "env", config: {  apikey: process.env.APIKEY }},
]);

console.log(config.apikey); // Access config values directly
console.log(config('backendUrl', 'https://fallback.url')); // Access with fallback
console.log(config.__inspect('apikey')); // Inspect which layer provided the value
```

# Features
- Easy to integrate into any project
- Layered configuration merging
- Deep key access (dot notation)
- Fallback values and custom not-found handlers
- Configuration inspection (see from which layer the value comes from)
- Immutable config proxy
- TypeScript support



# Why?

Config Layers is a TypeScript library for managing complex configuration objects with support for inspection, fallbacks, and immutability. Useful for applications that need to rely on configuration from multiple sources and detail level (e.g., defaults, environment, country, region, app template).

The library was born out of real world needs, when working on projects with complex configuration requirements. It was written from scratch, but based on real experiences and conclusions, with fresh approach, not tainted by legacy decisions. It's not a corporate code that was open-sourced, but rather a personal project, aimed to address the actual needs, without having to satisfy budget constraints, sprint goal, lack of time for refactoring and other such nonsense. :-)

Besides, it's far easier to point the new person to a library on github than to explain in-house code, even if it's documented in confluence, don't you think? ;-)

The library is not _opinionated_, that means we don't force you to use any specific file structure, environment variable naming conventions, or configuration formats. You can integrate this library into any project structure and use it alongside your existing configuration management practices. It's up to you to decide how to source and organize your configuration data.

In modern applications, configuration often comes from multiple sources: some default settings, environment-specific overrides, user-specific preferences, etc. Managing these layers manually can lead to complex and error-prone code. 

If your application has like 5 environments, supports over 40 countries, and allows user-specific settings, the number of configuration combinations can grow exponentially. This library helps manage this complexity by providing a structured way to access the config values.

Why not just use object spread or lodash merge? Like this:

```
export const config = {
  ...layers[0].config,
  ...layers[1].config,
  ...layers[2].config,
}
```

While you can can merge objects, you get no inspection capabilities, and the approach falls short for nested objects. Real world use cases involve complex config layouts, with nested objects, arrays, and various data types, as well as masked values, so that api secrets don't get dumped into the logs. This library handles these complexities while providing a clean typesafe API.

Full-grown solutions like https://www.npmjs.com/package/config (its pretty exhaustive, btw! well thought out!) provide an opinionated way of managing the configuration, often tied to file system layouts and specific environment variable conventions. The Layered Config library is unopinionated and can be integrated into any project structure. It's perfectly reasonable to stick to dotenv or predefined json files for smaller projects, leverage complex yaml files with preprocessing for mid-sized projects, and solutions like AppConfig from AWS for large scale applications. This library can be used in all those scenarios providing a nice and tidy abstraction over different implementations. 

Using json/yaml directly lacks type safety and inspection capabilities. How many times we try configuring something only to find out that the value comes from a different source than we expected?. Object spread makes sense only for smallest setups, but becomes unmanageable quickly.

Let's consider such config schema:
```ts
type API={
    apiEndpoint: string;
    apikey: ()=>string;
    authenticationScheme: 'none' | 'basic' | 'oauth';
}
type Config = {
    envName: string; // e.g. "development", "staging", "production"
    apis:{
        weather: API;
        search: API;
        maps: API;
    }
}
```

This use case can't be handled with simple object-spread approach. It doesn't scale well. You would need to write custom merging logic for nested objects (or use lodash merge), and eventually it becomes difficult to track which value comes from which config layer. That's why we implemented the inspection feature.

On the other hand, using solutions like AppConfig enforces you to jump in with both feet, to 100% adopt their way of doing things, and it's not always feasible. For local development and quick prototyping - AppConfig is troublesome, for small projects - it's overkill. Feature flag solutions like LaunchDarkly are great for toggling features, but not for managing complex configuration objects.

## Key benefits

- **Separation of Concerns**: Different configuration layers (e.g., defaults, environment-specific, user-specific) can be managed independently.
- **Flexibility**: Easily override configuration values based on context (e.g., development vs production).
- **Transparency**: Inspect which layer provided a specific configuration value, aiding in debugging and transparency.
- **Type Safety**: TypeScript support ensures that configuration values adhere to expected types, reducing runtime errors and allowing you to rely on intellisense when writing code.

# Usage

NOTE: Examples use dynamic imports due to [Vitest doctest](https://github.com/ssssota/doc-vitest) limitations.

Feel free to import traditionally or dynamically as shown in the examples.


### Basic [README.md](README.md)Example
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

Please note that we don't validate your config objects against the schema at runtime. The library relies on TypeScript's static type checking to ensure that the configuration objects conform to the specified schema. This means that its possible to inject invalid config objects at runtime if you bypass TypeScript checks. Always ensure that your configuration objects match the expected types to avoid runtime errors. It must be relatively easy to employ i.e. [Zod] to validate the config object, either as whole or layer by layer, and it is with Layered Config. Consult the [examples](./examples) folder for more usage patterns.
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

### Special names

The config proxy provides a special method: `__inspect`, therefore it's a reserved word. It's prefixed with double underscore to avoid name collisions with your config keys. If you need to use keys starting with double underscore, consider using the callback notation. If your config keys must rely on dots within flat array, use the callback notation as well and double the dots in your code.

```typescript :@import.meta.vitest
//import {LayeredConfig} from 'config-layers';
const {LayeredConfig} = await import('./dist/config-layers.js');

const layers = [
    {name: "default", config: JSON.parse(`{
    "regularName": "1", 
    "special.name": "2"
    }`)},
];

const cfg = LayeredConfig.fromLayers(layers);

expect(cfg['regularName']).toBe('1'); // works as expected
expect(cfg.regularName).toBe('1'); // works as expected
expect(cfg('special..name')).toBe('2'); // double dot avoids nesting
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
- `cfg.__derive(options)`: Returns a new config with new options (e.g., a custom notFoundHandler).
- `cfg.__derive(layerName, layerConfig)`: Returns a new config with the given layer added or replaced.
- `cfg.__derive(layerName, layerConfig, options)`: Returns a new config with both a new/overridden layer and new options.

The original config is never mutated. All derived configs are independent proxies.

Consult the [unit tests](./tests/basic.test.ts) and [examples](./examples) folder for more usage patterns.

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
