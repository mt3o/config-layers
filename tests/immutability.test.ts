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


describe('Layer immutability', () => {
    it('should throw when attempting to modify a frozen layer', () => {
        const cfg = LayeredConfig.fromLayers<Schema>(layers);
        const layer = cfg.__inspect('apikey').layers.find(l => l.layer === 'env');
        expect(() => {
            // Attempt to mutate the layer object
            //@ts-ignore
            layer.value.apikey = 'hacked-key';
        }).toThrow("Cannot create property 'apikey' on string '2137-dev-apikey'");
    });
});
