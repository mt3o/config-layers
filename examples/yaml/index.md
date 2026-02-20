# Using YAML Configuration Files with Config Layers

This example demonstrates how to use YAML files as configuration layers with the `config-layers` library. YAML is 
a popular format for configuration files due to its readability and support for complex data structures.

Of course it's also possible to mix and match different formats, e.g. have some configuration in JSON files, 
some in YAML files and some in environment variables.

## Prerequisites

To work with YAML files, you'll need a YAML parser. This example assumes you have the `js-yaml` library installed 
(it's described in the `package.json` for `examples` directory), but you can use any YAML parser of your choice.


For example using the `js-yaml` library:

```bash
npm install js-yaml
npm install @types/js-yaml --save-dev
```


## Basic Usage

Here's a simple example of loading configuration from multiple YAML files:

```typescript yaml-sample:@import.meta.vitest
// Import the required libraries
const {LayeredConfig} = await import('../../dist/config-layers.js');
const fs = await import('fs');
const url = await import('url');
const path = await import('path');

let hasDependenciesInstalled = false;
let yaml;

try {
    yaml = await import('js-yaml');
    hasDecoratorsInstalled = true;
} catch (e) {
    console.info("Missing dependency: js-yaml not installed; re-run test from within the examples/yaml dir");
}

// ⬇️ Conditionally run the test suite ⬇️
if (hasDependenciesInstalled) {

// Define your configuration schema
    type Schema = {
        envName: "local" | "dev" | "staging" | "production";
        apiUrl: string;
        timeout: number;
        features: {
            darkMode: boolean;
            notifications: boolean;
        };
        logging: {
            level: 'debug' | 'info' | 'warn' | 'error';
            format: string;
        };
    };
    const base = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'config');
// Load configuration from YAML files
    const defaultConfig = yaml.load(fs.readFileSync(path.join(base, 'default.yaml'), 'utf8')) as Partial<Schema>;
    const envConfig = yaml.load(fs.readFileSync(path.join(base, `development.yaml`), 'utf8')) as Partial<Schema>;
    const userConfig = yaml.load(fs.readFileSync(path.join(base, `user.yaml`), 'utf8')) as Partial<Schema>;

// Create layered configuration
    const config = LayeredConfig.fromLayers<Schema>([
        {name: 'default', config: defaultConfig},
        {name: 'environment', config: envConfig},
        {name: 'user', config: userConfig},
    ]);

// Access configuration values
    expect(config.apiUrl).toBe('https://dev-api.example.com'); // Access directly
    expect(config.features.darkMode).toBe(true); // Access nested properties
    expect(config('logging.format', 'json')).toBe('json'); // Access with fallback
}else{
    console.info("Skipping yaml example - js-yaml not installed");
}
```

## Example YAML Files

Here are examples of what your YAML files might look like:

### [default.yaml](config/default.yaml)
```yaml
apiUrl: https://api.example.com
timeout: 5000
features:
  darkMode: false
  notifications: true
logging:
  level: info
  format: json
```

### [development.yaml](config/development.yaml)
```yaml
apiUrl: https://dev-api.example.com
timeout: 10000
logging:
  level: debug
```

### [user.yaml](config/user.yaml)
```yaml
features:
  darkMode: true
```

## Loading Configuration Conditionally

You can conditionally load YAML files based on environment variables or other conditions:

```typescript
// Determine which environment config to load
const env = process.env.NODE_ENV || 'development';
const envConfigPath = `config/${env}.yaml`;

// Check if the file exists before loading
let envConfig = {};
if (fs.existsSync(envConfigPath)) {
  envConfig = yaml.load(fs.readFileSync(envConfigPath, 'utf8')) as Partial<Schema>;
}

// Create layered configuration
const config = LayeredConfig.fromLayers<Schema>([
  { name: 'default', config: defaultConfig },
  { name: 'environment', config: envConfig },
  // Add user config only if it exists
  ...(fs.existsSync('config/user.yaml') 
    ? [{ name: 'user', config: yaml.load(fs.readFileSync('config/user.yaml', 'utf8')) as Partial<Schema> }] 
    : [])
]);
```

## Inspecting Configuration Sources

One of the powerful features of the `config-layers` library is the ability to inspect which layer provided a specific configuration value:

```typescript
// Inspect where a configuration value came from
const apiUrlInfo = config.__inspect('apiUrl');
console.log(`apiUrl: ${config.apiUrl}`);
console.log(`Source: ${apiUrlInfo.resolved.source}`);

// You can also inspect nested properties
const darkModeInfo = config.__inspect('features.darkMode');
console.log(`darkMode: ${config.features.darkMode}`);
console.log(`Source: ${darkModeInfo.resolved.source}`);
```

## Deriving New Configurations

You can derive new configurations from existing ones, adding or replacing layers:

```typescript
// Load a country-specific configuration
const countryConfig = yaml.load(fs.readFileSync('config/countries/us.yaml', 'utf8')) as Partial<Schema>;

// Derive a new configuration with the country-specific layer
const countrySpecificConfig = config.__derive('country', countryConfig);

// Access country-specific configuration values
console.log(countrySpecificConfig.apiUrl);
```

## Error Handling

You can customize how missing configuration values are handled:

```typescript
// Create configuration with custom error handling
const configWithCustomErrors = LayeredConfig.fromLayers<Schema>(
  [
    { name: 'default', config: defaultConfig },
    { name: 'environment', config: envConfig },
  ],
  {
    notFoundHandler: (key) => {
      console.warn(`Configuration key not found: ${String(key)}`);
      return undefined; // Return a default value
    }
  }
);

// This will log a warning instead of throwing an error
const missingValue = configWithCustomErrors.nonExistentKey;
```

## Conclusion

Using YAML files with the `config-layers` library provides a flexible and powerful way to manage configuration in your application. You can easily merge configuration from multiple sources, access nested properties, and inspect which layer provided a specific value. Leveraging all the yaml features like anchrors and references, typed values and complex structures makes it a powerful choice for configuration management. 
