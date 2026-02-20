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
  { name: "default", config: JSON.parse(fs.readFileSync('config/default.json', 'utf-8')) },  //least priority
  { name: "env", config: {  apikey: process.env.APIKEY }}, //last = highest priority
]);

console.log(config.apikey); // Access config values directly
console.log(config('backendUrl', 'https://fallback.url')); // Access with fallback
console.log(config.__inspect('apikey')); // Inspect which layer provided the value
```

This library lets you organize your config settings into named layers, loaded from lowest to highest priority. If a setting exists in a higher layer, it will be used; otherwise, the next (lower) layer is checked. This helps you combine config from different places into one object.

Defaults can have the lowest priority, while environment-specific values (like from dotenv files or environment variables) can override them.                                        

All the merging is handled for you in a type-safe way. You define the config structure using a TypeScript type or interface. You can also use validation libraries like Zod or JSON Schema if you want, but it’s not required. If you use any instead of a type, you lose type safety, which is one of the main benefits of using TypeScript. For runtime validation, see the [Zod validation](examples/zod-validate) example.

# Features

- Easy to integrate into any project
- Layered configuration merging
- Deep key access (dot notation)
- Fallback values and custom not-found handlers
- Configuration inspection (see from which layer the valueF comes from)
- Immutable config proxy, frozen config object
- TypeScript support

## Why?

_Note: full article in [docs/why.md](docs/why.md)_

Config Layers is a TypeScript library for managing complex hierarchical configuration objects with support for inspection, fallbacks, and immutability. Useful for applications that need to rely on configuration from multiple sources and detail level (e.g., defaults, environment, country, region, page template).


# Usage

_NOTE: Examples use dynamic imports due to [Vitest doctest](https://github.com/ssssota/doc-vitest) limitations._

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
  { name: "default", config: { useMocks: false, } }, //least priority
  { name: "env", config: { apikey: "2137-dev-apikey", useMocks: true } },
  { name: "user", config: { userContext: { userId: "user123", roles: ["admin", "user"] } } }, //highest priority
];

const cfg = LayeredConfig.fromLayers<Schema>(layers);

//It resolves from the highest priority layer
expect(cfg.apikey).toBe('2137-dev-apikey'); // defined only in `env` layer
expect(cfg.useMocks).toBe(true); // `env` layer overrides `default` => true
expect(cfg.userContext.userId).toBe('user123'); // compound values are also accepted
```

Please note that we don't validate your config objects against the schema at runtime. The library relies on TypeScript's static type checking to ensure that the configuration objects conform to the specified schema. This means that its possible to inject invalid config objects at runtime - bypassing TypeScript checks. Always ensure that your configuration objects match the expected types to avoid runtime errors. In yout code it must be relatively easy to employ i.e. [Zod](https://zod.dev/) to validate the config object, either as whole or layer by layer, and it is with Layered Config. Consult the [examples](./examples) folder for more usage patterns.

### API
- `LayeredConfig.fromLayers(layers, options?)`: Create a layered config proxy.
- `cfg.${key}`: Get a value by key.
- `cfg[key]`: Get a value by key.
- `cfg.__inspect(key)`: Inspect the source and value for a key.
- `cfg(key, fallback?)`: Get a value with fallback.
- `cfg.getAll(key)`: Get all values for a key from all layers, returns as `Array<{layer: string, value: any}>`.
- `cfg.__derive(...)`: Derive a new config with additional/overridden layers or options.
                                      
### Special names

The config proxy provides a few sepcial methods to assist you. 

- `__inspect` - to inspect which layer provided the value for a given key
- `__derive` - to derive a new config with additional/overridden layers or options
- `get` - callback notation to get a value, with optional fallback
- `getAll` - callback notation to get all values for a key, from all layers, and return them as an `Array<{layer: string, value: any}>` so that you can easily unpack them

These words are reserved, so you can't create config keys with these names. 

### Accessing config values

You can access config values directly as properties, with index access, or use the callback notation to provide a fallback value.

```typescript 
cfg.apikey; // direct property access
cfg['apikey']; // index access
cfg('apikey'); // callback notation
cfg('apikey', 'default-apikey'); // with fallback

cfg.nested.field; // direct property access
cfg['nested.field']; // index access
cfg('nested.field'); // callback notation
cfg('nested.field', 'default-value'); // with fallback
```
In case your config defines values that are arrays, the simple access - returns only the highest priority value. If you need to get all values from all layers, use the `getAll` special method.

```typescript
cfg.getAll('arrayKey'); // returns Array<{layer: string, value: any}>
cfg.getAll('enabled.features').map(item=>item.value); // get only the values, as array of arrays
```

To flatten the array of arrays, use flatMap

```typescript :@import.meta.vitest
const {LayeredConfig} = await import('./dist/config-layers.js');
const layers = [
  { name: "1", config: { "features": ["f1", "f2","f4"] } },
  { name: "2", config: {"features": ["f3"] } } ,
  { name: "3", config: {"features": ["f3","f4", "f5"] } },
];
const cfg = LayeredConfig.fromLayers<{features: string[]}>(layers);
expect(cfg.features).toEqual(['f3', 'f4', 'f5']); // highest priority only
//get all values from all layers
expect(cfg.getAll('features').map(item=>item.value)).toEqual([
  ['f3','f4','f5'],
  ['f3'],
  ['f1','f2','f4'],
]);
//flatten the array of arrays with flatMap()
expect(cfg.getAll('features').flatMap(item=>item.value)).toEqual([
  'f3','f4','f5',
  'f3',
  'f1','f2','f4',
]);
//Get unique values only, with help of the Set() and flatmap()
expect(Array.from(new Set(
    cfg.getAll('features').flatMap(item=>item.value)
))).toStrictEqual(['f3','f4','f5','f1','f2']);
```


### Config options

#### Not Found Handler

In typical scenario, when config value is not found, you expect an error to be thrown. This is the default behavior. However, in some cases you might want to provide a fallback value or handle missing keys gracefully. You can do this by providing a custom `notFoundHandler` function when creating the layered config.

```typescript :@import.meta.vitest
//import {LayeredConfig} from 'config-layers';
const {LayeredConfig} = await import('./dist/config-layers.js');
const cfg = LayeredConfig.fromLayers<{apikey: string}>(
  [{ name: "default", config: {} }], //the config is empty in this example
  {
    notFoundHandler: key => { //when key is not found, this handler is called
      return 'XD';  //return a default value for any missing key
    }
  }
);
expect(cfg.anything).toBe('XD'); // the handler is called for any missing key
```

#### Freeze

By default the config object is frozen, so that you can't mutate it. This is to ensure immutability and prevent accidental changes to the configuration at runtime. To replace or add the config layers, you should use the `__derive` method, which creates a new config object based on the existing one, with the specified changes.

If you need to modify the config object (not recommended), you can disable freezing by setting the `freeze` option to `false`.

```typescript
import {LayeredConfig} from 'config-layers';
const cfg = LayeredConfig.fromLayers<{apikey: string}>(
  [{/*...*/}], //provide your config layers here
  {
    freeze: false //mark the config object as mutable
  }
);
```

#### Accepting nulls and undefiined values

By default not defined keys in one of the config layer, null and undefined values are treated as transparent, so values from other layers are used. However you can change the behavior, if null or undefined is accepted as a config value for you, you can set it using relevant option.

```ts
import {LayeredConfig} from 'config-layers';
const cfg = LayeredConfig.fromLayers<{apikey: string}>(
  [{/*...*/}], //provide your config layers here
  {
    acceptNull: true,
    acceptUndefined: true,
  }
);
```

### Fallbacks

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

### Inspecting Configuration with `__inspect`

The inspection special word is prefixed with double underscore to avoid name collisions with your config keys. If you need to use keys starting with double underscore, consider using the callback notation. If your config keys must rely on dots within flat array, use the callback notation as well and double the dots in your code.

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

#### API for `__derive`

- `cfg.__derive(options)`: Returns a new config with new options (e.g., a custom notFoundHandler).
- `cfg.__derive(layerName, layerConfig)`: Returns a new config with the given layer added or replaced.
- `cfg.__derive(layerName, layerConfig, options)`: Returns a new config with both a new/overridden layer and new options.

The original config is never mutated. All derived configs are independent proxies.

Consult the [unit tests](./tests/basic.test.ts) and [examples](./examples) folder for more usage patterns.


## Testing

This project uses [Vitest](https://vitest.dev/) and [vite-plugin-doctest](https://github.com/egoist/vite-plugin-doctest) for testing and documentation.

Run tests with:
```bash
npm test
```
To run tests also for the code examples, install the dependencies in the `examples` folder:
```bash
cd examples
npm install
cd ..
npm test
```
             
## Further reading

- [**Why?**](docs/why.md) - the motivation and reasoning behind the library is explained in the [docs/why.md](docs/why.md) file.
- [**Tips and tricks**](docs/tips-and-tricks.md) for implementing configuration management are available in the [docs/tips-and-tricks.md](docs/tips-and-tricks.md) file.

- Other libraries focused on config management:
  - [convict](https://www.npmjs.com/package/convict) - schema-based config management with validation and environment variable support.
  - [config](https://www.npmjs.com/package/config) - feature-rich opinionated config library with file-based layers and environment support.
  - [nconf](https://www.npmjs.com/package/nconf) - hierarchical config with multiple sources and priority levels. Batteries included, 
  - [dotenv-flow](https://www.npmjs.com/package/dotenv-flow) - extended version of dotenv supporting multiple .env files for different environments.
  - [dotenv](https://www.npmjs.com/package/dotenv) - loads env vars from .env files, often used alongside other config libraries.
  - [Zod](https://zod.dev/) - schema validation library that can be used to validate config objects at runtime.
  - [ajv](https://ajv.js.org/) - another JSON Schema validator for runtime config validation, can be used together with JSON Schema.

## Contributing

Contributions are welcome! Please open [issues](https://github.com/mt3o/config-layers/issues) or pull requests for improvements or bug fixes.

## Special thanks

For all the initial insights, testing and proofreading - thank to [Karol Witkowski](https://github.com/Karol-Witkowski)!

For helping me in writing the docs and code examples - thanks to [Junie](https://www.jetbrains.com/junie/) by JetBrains!

## License

[Unlicense](LICENSE). Take it and use it for any purpose, without any restrictions.
