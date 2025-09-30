
# Why?

Config Layers is a TypeScript library for managing complex hierarchical configuration objects with support for inspection, fallbacks, and immutability. Useful for applications that need to rely on configuration from multiple sources and detail level (e.g., defaults, environment, country, region, page template).

The library was born out of real world needs, when working on projects with complex configuration requirements. It was written from scratch, but based on real experiences and conclusions, with fresh approach, not tainted by legacy decisions. It's not a corporate code that was open-sourced, but rather a personal project, aimed to address the actual needs, without having to satisfy budget constraints, sprint goal, lack of time for refactoring and other such nonsense. :-)

Besides, it's far easier to point the new person to a library on github than to explain in-house code, even if it's well documented in the Confluence, don't you think? ;-)

The library is not _opinionated_, that means we don't force you to use any specific file structure, environment variable naming conventions, or configuration formats. You can integrate this library into any project structure and use it alongside your existing configuration management practices. It's up to you to decide how to source and organize your configuration data.

In modern applications, configuration often comes from multiple sources: some default settings, environment-specific overrides, user-specific preferences, etc. Managing these layers manually can lead to complex and error-prone code. 

If your application has like 5 environments, supports over 40 countries, and allows user-specific settings, the number of configuration combinations can grow exponentially. This library helps manage this complexity by providing a structured way to access the config values.

Why not just use object spread or lodash merge? Like this:

```
export const config = {
  ...layers[0].config, //least priority
  ...layers[1].config,
  ...layers[2].config, //highest priority
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

This use case can't be handled with simple object-spread approach. It doesn't scale well. You would need to write custom merging logic for nested objects (or use lodash merge), and eventually it becomes difficult to track which value comes from which config layer. That's why the inspection feature was implemented.

On the other hand, using solutions like AWS AppConfig enforces you to jump in with both feet, to 100% adopt their way of doing things, and it's not always feasible. For local development and quick prototyping - AppConfig is troublesome, for small projects - it's overkill. Feature flag solutions like LaunchDarkly are great for toggling features with a UI, but not for managing complex configuration objects with database credentials, api keys and service secrets.


# Key benefits

- **Separation of Concerns**: Different configuration layers (e.g., defaults, environment-specific, user-specific) can be managed independently.
- **Flexibility**: Easily override configuration values based on context (e.g., development vs production).
- **Transparency**: Inspect which layer provided a specific configuration value, aiding in debugging and transparency.
- **Type Safety**: TypeScript support ensures that configuration values adhere to expected types, reducing runtime errors and allowing you to rely on intellisense when writing code.
