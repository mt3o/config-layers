## Tips and tricks for implementing configuration management

## Single responsibility principle

Try to keep your config schema focused on a specific area of conceorn. If your application has multiple distinct modules or services, consider creating separate config schemas for each. This keeps the configuration manageable and easier to understand. Typical setup might involve:

- **Business config** - general application settings, feature toggles, everything the developers cooperate on with the business users. Local setup leverages overrides in the .env so that feature is available on developers laptops without modifying any files, while production setup relies on environment variables set in the deployment pipeline.
- **Environmental config** - connection strings, pool sizes, timeouts - typically stuff that the DevOps team cooperates on with the developers. Local setup leverages overrides in the .env file, while production setup relies on environment variables set in the deployment pipeline.
- **Localization** - labels, messages, date/number formats - typically delegated to the translators and content editors. Values here require a fallback mechanism, so that missing keys can be handled gracefully. Something like: `labels.get('hero.title', 'Default title')`.

## Let your IDE help you

The config object is a typed proxy, so you get full intellisense support in your IDE. This makes it easy to discover available config keys and their types, reducing the chances of typos or incorrect usage.

This is also the reason why sprinkling your code with `process.env.XYZ` is not a good idea. You lose type safety, and intellisense support. Instead, load the environment variables into a config layer, and access them via the typed config proxy.


### Use with validation libraries

While the library doesn't enforce runtime validation, you can easily integrate it with libraries like [Zod](https://zod.dev/) or [ajv](https://ajv.js.org/) with JSON Schema to validate your config objects when they are loaded. This adds an extra layer of safety, ensuring that your configuration adheres to expected formats and types.

### Testing, testing, testing!

Yes, you can write unit tests for your configuration. Because why not? If you must be sure that certain property holds certain value on a specific environment and setup, why not unit test it?                                                 
Just be careful not to load the dedicated environment setup for unit tests, you should impose it with stubs/mocks for particular unit tests. How many times the unit test failed because the config for feature flags got switched and the tests started failing? Automated tests should be deterministic, so make sure to control the config layers used in your tests. With vitest you can stub the env vars https://vitest.dev/api/vi.html#vi-stubenv with `vi.stubEnv('ENV_NAME', 'prd')` and guide the config loading accordingly.

## Establish sensible defaults, then override them

It's handy to define a set of defaults directly in the typescript code, and then override them using environment-specific setup with JSON files, and override them further with environment variables. This way you have a clear base configuration, and can easily adjust it for different environments without duplicating the entire config.

Authors typical setup is:

- Default values in code (lowest priority)
- Yaml/json files for general config values, for example external api endpoints
- Yaml/json files for config values specific to the deployment environment, for example feature toggles
- Environment variables (highest priority), read from process.env as well as the dotfiles. 

This way you can have a clear base configuration, and adjust it for different environments without duplicating the entire config. For local development, you can use a `.env` file with [dotenv](https://www.npmjs.com/package/dotenv) to load environment variables, or switch individual flags on and off when starting the app, without modifying any files. It's useful for example when replacing concrete implementations with mocks for integration testing.

## Monitor config changes

Implement a mechanism to monitor changes in your configuration files, especially if they are expected to change at runtime. This could be as simple as a file watcher that reloads the config when a file changes, or a more complex solution that polls a remote configuration service. This ensures that your application can adapt to configuration changes without needing a restart. At the same time keep a log of the configuration changes, so that you can trace back what changed and when. For simpler applications, or with Continous Deployment approach, versioning the config files in git should be enough.

## Don't spill your secrets

It's not the best approach to put secrets like API keys directly into JSON files, especially if they are checked into version control. Instead, use environment variables with a secure vault service to manage sensitive information, and load them into your config at runtime. In the config object, instead of keeping them as plain strings, consider using functions that return the secret values. This way, you can avoid accidental logging of sensitive data.
