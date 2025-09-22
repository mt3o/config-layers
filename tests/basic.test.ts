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

describe('Config layers', () => {
    it('should work', () => {

        expect(cfg.useMocks).toBe(true);
        expect(cfg.apikey).toBe('2137-dev-apikey');
        expect(cfg.userContext.userId).toBe('user123');
        expect(cfg.userContext.roles).toEqual(['admin', 'user']);
        expect(cfg.envName).toBe('development');
        expect(() => {
            console.log(cfg.undef)
        }).toThrow();
    });
});


describe('inspection', () => {

    it('handles not existing keys correctly', () => {
        expect(cfg.__inspect('not-exists')).toStrictEqual({
            "key": "not-exists",
            "layers": [
                {"isActive": false, "isPresent": false, "layer": "user", "value": undefined,},
                {"isActive": false, "isPresent": false, "layer": "env", "value": undefined,},
                {"isActive": false, "isPresent": false, "layer": "default", "value": undefined,},
            ],
            "resolved": {"source": "", "value": undefined,},
        });
    });
    it('inspects `session` when key is in a top layer', () => {
        expect(cfg.__inspect('session')).toStrictEqual({
            "key": "session",
            "layers": [
                {"isActive": true, "isPresent": true, "layer": "user", "value": 'abcd',},
                {"isActive": false, "isPresent": false, "layer": "env", "value": undefined,},
                {"isActive": false, "isPresent": false, "layer": "default", "value": undefined,},
            ],
            "resolved": {"source": "user", "value": 'abcd',},
        });
    });
    it('inspects `path` when key is in a lower layer', () => {
        expect(cfg.__inspect('path')).toStrictEqual({
            "key": "path",
            "layers": [
                {"isActive": false, "isPresent": false, "layer": "user", "value": undefined,},
                {"isActive": false, "isPresent": false, "layer": "env", "value": undefined,},
                {"isActive": true, "isPresent": true, "layer": "default", "value": 'cwd',},
            ],
            "resolved": {"source": "default", "value": 'cwd',},
        });
    });
    it('inspects `apikey` when key is in a middle layer', () => {
        expect(cfg.__inspect('apikey')).toStrictEqual({
            "key": "apikey",
            "layers": [
                {"isActive": false, "isPresent": false, "layer": "user", "value": undefined,},
                {"isActive": true, "isPresent": true, "layer": "env", "value": '2137-dev-apikey',},
                {"isActive": false, "isPresent": false, "layer": "default", "value": undefined,},
            ],
            "resolved": {"source": "env", "value": '2137-dev-apikey',},
        });
    });
    it('inspects `useMocks` when key has override', () => {
        expect(cfg.__inspect('useMocks')).toStrictEqual({
            "key": "useMocks",
            "layers": [
                {"isActive": false, "isPresent": false, "layer": "user", "value": undefined,},
                {"isActive": true, "isPresent": true, "layer": "env", "value": true,},
                {"isActive": false, "isPresent": true, "layer": "default", "value": false,},
            ],
            "resolved": {"source": "env", "value": true,},
        });
    });
    it('inspects `envName` when key is overridden in env layer', () => {
        expect(cfg.__inspect('envName')).toStrictEqual({
            "key": "envName",
            "layers": [
                {"isActive": false, "isPresent": false, "layer": "user", "value": undefined,},
                {"isActive": true, "isPresent": true, "layer": "env", "value": "development",},
                {"isActive": false, "isPresent": true, "layer": "default", "value": "not set",},
            ],
            "resolved": {"source": "env", "value": "development",},
        });
    });
    it('inspects `userContext` for compund object', () => {
        const v = {userId: 'user123',roles: ['admin', 'user']};
        expect(cfg.__inspect('userContext')).toStrictEqual({
            "key": "userContext",
            "layers": [
                {"isActive": true, "isPresent": true, "layer": "user", "value":v,},
                {"isActive": false, "isPresent": false, "layer": "env", "value": undefined,},
                {"isActive": false, "isPresent": false, "layer": "default", "value": undefined,},
            ],
            "resolved": {"source": "user", "value": v,},
        });
    });
    it('inspects `userContext.userId` when key is in a deep object', () => {
        expect(cfg.__inspect('userContext.userId')).toStrictEqual({
            "key": "userContext.userId",
            "layers": [
                {"isActive": true, "isPresent": true, "layer": "user", "value": "user123",},
                {"isActive": false, "isPresent": false, "layer": "env", "value": undefined,},
                {"isActive": false, "isPresent": false, "layer": "default", "value": undefined,},
            ],
            "resolved": {"source": "user", "value": "user123",},
        });
    });
});

type Labels = {
    button: string;
}

describe('with fallbacks',()=>{
    const labels = LayeredConfig.fromLayers<Labels>([
        {name:'default',   config:{button: "Accept cookies"}},
        {name:'localized', config:{button: 'I would like the biscuits, please!'}},
    ],{
        notFoundHandler: key=>'<<'+key.toString()+'>>',
    });

    it('should use localized value',()=>{
        expect(labels.button).toBe('I would like the biscuits, please!');
        expect(labels('button','xx')).toBe('I would like the biscuits, please!');
        // @ts-ignore
        expect(labels.button2).toBe('<<button2>>');
        // @ts-ignore
        expect(labels['button2']).toBe('<<button2>>');
        // @ts-ignore
        expect(labels('button2','cookie msg2')).toBe('cookie msg2');
    })
});

describe('proxy handlers',()=>{
    it('config is immutable',()=>{
        expect(()=>Object.defineProperty(cfg,'foo',{})).toThrow();
        expect(()=>{delete cfg.undef}).toThrow();
    })
    it('knows keys',()=>{
        const keys = Object.keys(cfg);
        expect(keys).toEqual([
            'useMocks',
            'envName',
            'path',
            'apikey',
            'session',
            'userContext',
            ]);
    })
});
