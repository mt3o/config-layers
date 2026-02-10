import {describe, expect, it} from "vitest";
import {LayeredConfig} from "../src";

type Schema = {
    apiUrl: string;
    timeout: number;
    then?: string; // Explicitly adding 'then' to schema to test conflict
}

describe('Async support', () => {
    it('should be awaitable (return undefined for then)', async () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'default', config: { apiUrl: 'http://localhost', timeout: 1000 } }
        ]);

        // This would throw if 'then' was intercepted and treated as a missing key
        const result = await config;

        // When awaited, it should resolve to itself
        expect(result).toBe(config);
    });

    it('should allow "then" to be a valid config key if explicitly defined', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'default', config: { then: 'value' } }
        ]);

        expect(config.then).toBe('value');
    });

    it('should return undefined for "then" if not in config', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'default', config: { apiUrl: 'http://localhost' } }
        ]);

        // @ts-ignore
        expect(config.then).toBeUndefined();
    });

    it('should handle async layer replacement', async () => {
        // Initial setup with two layers
        let config = LayeredConfig.fromLayers<Schema>([
            { name: 'default', config: { apiUrl: 'http://localhost', timeout: 1000 } },
            { name: 'env', config: { timeout: 2000 } }
        ]);

        // Assert initial value
        expect(config.timeout).toBe(2000);

        const updateConfig = async ()=>{

            const fetchNewEnvConfig = async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { timeout: 5000 };
            };

            const newEnvConfig = await fetchNewEnvConfig();

            // Replace the 'env' layer using __derive
            return config.__derive('env', newEnvConfig);
        }
        // Simulate async operation to fetch new config

        const derivedConfig = await updateConfig();

        // Assert the value after async replacement
        expect(derivedConfig.timeout).toBe(5000);
        // Ensure other values remain from default layer
        expect(derivedConfig.apiUrl).toBe('http://localhost');
    });
});
