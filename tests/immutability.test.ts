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
            //@ts-expect-error layer is possibly undefined, and its value is typed as the schema not a string
            layer.value.apikey = 'hacked-key';
        }).toThrow("Cannot create property 'apikey' on string '2137-dev-apikey'");
    });
});

/**
 * what `freeze` actually reaches. The single test above only covered one incidental case;
 * these pin the depth of the freeze and the fact that it stops at the caller's own data.
 */
describe('freeze depth', () => {

    const nested = () => LayeredConfig.fromLayers<any>([{
        name: 'a',
        config: {
            top: 'v',
            obj: {mid: {leaf: 'v'}},
            list: ['a', {inList: 'v'}, [{deep: 'v'}]],
            listOfLists: [[['deep']]],
        },
    }]);

    it('freezes the whole plain-object spine', () => {
        const cfg: any = nested();
        expect(Object.isFrozen(cfg.obj)).toBe(true);
        expect(Object.isFrozen(cfg.obj.mid)).toBe(true);
    });

    it('freezes arrays and the objects inside them', () => {
        const cfg: any = nested();
        expect(Object.isFrozen(cfg.list)).toBe(true);
        expect(Object.isFrozen(cfg.list[1])).toBe(true);
    });

    it('freezes arrays nested inside arrays, all the way down', () => {
        const cfg: any = nested();
        expect(Object.isFrozen(cfg.list[2])).toBe(true);
        expect(Object.isFrozen(cfg.list[2][0])).toBe(true);
        expect(Object.isFrozen(cfg.listOfLists[0][0])).toBe(true);
    });

    it('rejects mutation at every depth', () => {
        const cfg: any = nested();
        expect(() => { cfg.obj.mid.leaf = 'hacked'; }).toThrow();
        expect(() => { cfg.list.push('hacked'); }).toThrow();
        expect(() => { cfg.list[1].inList = 'hacked'; }).toThrow();
        expect(() => { cfg.list[2][0].deep = 'hacked'; }).toThrow();
    });

    it('leaves the caller\'s layer untouched at every depth', () => {
        const layer: any = {obj: {mid: {leaf: 'v'}}, list: [{inList: 'v'}]};
        LayeredConfig.fromLayers<any>([{name: 'a', config: layer}]);
        expect(Object.isFrozen(layer)).toBe(false);
        expect(Object.isFrozen(layer.obj)).toBe(false);
        expect(Object.isFrozen(layer.obj.mid)).toBe(false);
        expect(Object.isFrozen(layer.list)).toBe(false);
        expect(Object.isFrozen(layer.list[0])).toBe(false);
    });

    describe('freeze: false', () => {
        it('leaves the config mutable at every depth', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([{
                name: 'a',
                config: {obj: {mid: 'v'}, list: [{inList: 'v'}]},
            }], {freeze: false});

            expect(Object.isFrozen(cfg.obj)).toBe(false);
            expect(Object.isFrozen(cfg.list)).toBe(false);
            expect(() => { cfg.obj.mid = 'changed'; }).not.toThrow();
            expect(cfg.obj.mid).toBe('changed');
        });

        it('still refuses writes through the handle itself', () => {
            // the proxy's set trap is not what `freeze` controls
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}], {freeze: false});
            expect(() => { cfg.x = 2; }).toThrow();
        });

        it('still does not share the caller\'s data', () => {
            const layer: any = {list: ['a'], obj: {v: 1}};
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: layer}], {freeze: false});
            layer.list.push('b');
            layer.obj.v = 99;
            expect(cfg.list).toEqual(['a']);
            expect(cfg.obj).toEqual({v: 1});
        });
    });

    describe('derived configs', () => {
        it('are frozen independently of the original', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {obj: {v: 1}}}]);
            const derived: any = cfg.__derive('b', {obj: {w: 2}});
            expect(Object.isFrozen(derived.obj)).toBe(true);
            expect(derived.obj).toEqual({v: 1, w: 2});
            expect(cfg.obj).toEqual({v: 1});
        });

        it('can opt out of freezing without unfreezing the original', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {obj: {v: 1}}}]);
            const loose: any = cfg.__derive({freeze: false});
            expect(Object.isFrozen(loose.obj)).toBe(false);
            expect(Object.isFrozen(cfg.obj)).toBe(true);
        });
    });
});
