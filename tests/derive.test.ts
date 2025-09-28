import {describe, expect, it} from "vitest";
import {LayeredConfig} from "../src";


type Schema = {
    apikey: string;
    useMocks: boolean;
    envName: string;
    userContext: {
        userId: string;
        roles: string[];
    }
    undef?: undefined;
    path: string;
    session: string;
}

const layers: Array<{ name: string; config: Partial<Schema> }> = [
    {
        name: "default", config: {
            useMocks: false,
            envName: "not set",
            path: "cwd",
        }
    },
    {
        name: "env", config: {
            envName: 'development',
            apikey: '2137-dev-apikey',
            useMocks: true,
        }
    },
    {
        name: "user", config: {
            session: 'abcd',
            userContext: {
                userId: 'user123',
                roles: ['admin', 'user'],
            }
        }
    }
];

const cfg = LayeredConfig.fromLayers<Schema>(layers);


describe('__derive', () => {
    it('should derive a new config with an added layer', () => {
        const derived = cfg.__derive('feature', {apikey: 'feature-key'});
        expect(derived.apikey).toBe('feature-key');
        // Original config remains unchanged
        expect(cfg.apikey).toBe('2137-dev-apikey');
    });

    it('should replace an existing layer', () => {
        const derived = cfg.__derive('env', {
            apikey: 'override-key'
        });
        expect(derived.apikey).toBe('override-key');
        // Whole layer is replaced, so envName is different now
        expect(cfg.envName).toBe('development');
        expect(derived.envName).toBe('not set');
    });

    it('should accept options and use a custom notFoundHandler', () => {
        const customHandler = (key: any) => `not found: ${key}`;
        const derived = cfg.__derive({notFoundHandler: customHandler});
        // @ts-expect-error: purposely accessing non-existent key
        expect(derived.nonexistent).toBe('not found: nonexistent');
    });

    it('should allow deriving with both layer and options', () => {
        const customHandler = (key: any) => `missing: ${key}`;
        const derived = cfg.__derive('feature', {path: '/feature'}, {notFoundHandler: customHandler});
        expect(derived.path).toBe('/feature');
        // @ts-expect-error: purposely accessing non-existent key
        expect(derived.nonexistent).toBe('missing: nonexistent');
    });

    it('should not mutate the original config', () => {
        const derived = cfg.__derive('feature', {apikey: 'new-key'});
        expect(cfg.apikey).toBe('2137-dev-apikey');
        expect(derived.apikey).toBe('new-key');
    });
});
