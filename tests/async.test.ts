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

        expect((config as any).then).toBeUndefined();
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


describe('LayeredConfig.fromLayersAsync', () => {

    const delay = <T>(ms: number, value: T): Promise<T> =>
        new Promise(resolve => setTimeout(() => resolve(value), ms));

    type Schema = {
        apiUrl: string;
        timeout: number;
        featureFlag: boolean;
    }

    describe('basic resolution', () => {
        it('resolves a single promise layer', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>([
                {name: 'default', config: delay(10, {apiUrl: 'http://localhost', timeout: 1000})}
            ]);
            expect(cfg.apiUrl).toBe('http://localhost');
            expect(cfg.timeout).toBe(1000);
        });

        it('resolves multiple promise layers in priority order', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>([
                {name: 'default', config: delay(20, {apiUrl: 'http://localhost', timeout: 1000})},
                {name: 'env',     config: delay(5,  {timeout: 3000})},
            ]);
            // env layer has higher priority despite resolving first
            expect(cfg.timeout).toBe(3000);
            expect(cfg.apiUrl).toBe('http://localhost');
        });
    });

    describe('mixed sync and async layers', () => {
        it('accepts a mix of plain objects and promises', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>([
                {name: 'default', config: {apiUrl: 'http://localhost', timeout: 1000}},
                {name: 'remote',  config: delay(10, {featureFlag: true})},
                {name: 'env',     config: {timeout: 5000}},
            ]);
            expect(cfg.timeout).toBe(5000);
            expect(cfg.featureFlag).toBe(true);
            expect(cfg.apiUrl).toBe('http://localhost');
        });
    });

    describe('error handling', () => {
        it('rejects if any layer promise rejects', async () => {
            const failing = Promise.reject(new Error('Remote config unavailable'));
            await expect(
                LayeredConfig.fromLayersAsync<Schema>([
                    {name: 'default', config: {apiUrl: 'http://localhost', timeout: 1000}},
                    {name: 'remote',  config: failing},
                ])
            ).rejects.toThrow('Remote config unavailable');
        });
    });

    describe('options passthrough', () => {
        it('passes options to the underlying fromLayers call', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>(
                [{name: 'default', config: delay(10, {})}],
                {notFoundHandler: () => 'missing'}
            );
            expect((cfg as any).nonExistentKey).toBe('missing');
        });

        it('respects freeze: false option', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>(
                [{name: 'default', config: delay(10, {timeout: 1000})}],
                {freeze: false}
            );
            expect(cfg.timeout).toBe(1000);
        });
    });

    describe('result behaves identically to fromLayers', () => {
        it('supports __inspect on async-loaded config', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>([
                {name: 'default', config: delay(10, {apiUrl: 'http://localhost', timeout: 1000})},
                {name: 'env',     config: delay(5,  {timeout: 3000})},
            ]);
            const inspection = cfg.__inspect('timeout');
            expect(inspection.resolved.source).toBe('env');
            expect(inspection.resolved.value).toBe(3000);
        });

        it('supports __derive on async-loaded config', async () => {
            const cfg = await LayeredConfig.fromLayersAsync<Schema>([
                {name: 'default', config: delay(10, {apiUrl: 'http://localhost', timeout: 1000})},
            ]);
            const derived = cfg.__derive('hotfix', {timeout: 500});
            expect(derived.timeout).toBe(500);
            expect(derived.apiUrl).toBe('http://localhost');
        });
    });
});
