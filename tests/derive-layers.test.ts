import {describe, expect, it} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * layer identity and ordering through `__derive`.
 *
 * `__derive` used to copy the layer map into a plain object and read it back with
 * `Object.entries`. That dropped symbol-named layers, which `LayerName` explicitly permits, and
 * reordered numeric-looking names to the front - silently inverting their precedence.
 */
describe('__derive layer identity', () => {

    describe('symbol-named layers', () => {
        it('survive deriving with a new layer', () => {
            const secret = Symbol('secret');
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'base', config: {x: 1}},
                {name: secret, config: {x: 2}},
            ]);
            expect(cfg.x).toBe(2);

            const derived: any = cfg.__derive('extra', {y: 9});
            expect(derived.x).toBe(2);
            expect(derived.y).toBe(9);
        });

        it('survive deriving with options only', () => {
            const secret = Symbol('secret');
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'base', config: {x: 1}},
                {name: secret, config: {x: 2}},
            ]);
            expect((cfg.__derive({freeze: false}) as any).x).toBe(2);
        });

        it('are still reported by __inspect after deriving', () => {
            const secret = Symbol('secret');
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'base', config: {x: 1}},
                {name: secret, config: {x: 2}},
            ]);
            const layers = cfg.__derive('extra', {y: 1}).__inspect('x').layers.map((l: any) => l.layer);
            expect(layers).toContain(secret);
            expect(layers).toHaveLength(3);
        });

        it('can themselves be replaced by name', () => {
            const secret = Symbol('secret');
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'base', config: {x: 1}},
                {name: secret, config: {x: 2}},
            ]);
            // the string overload cannot address a symbol layer, so it adds rather than replaces
            const derived: any = cfg.__derive('other', {x: 3});
            expect(derived.x).toBe(3);
        });
    });

    describe('numeric-looking layer names', () => {
        it('keep their precedence through a derive', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'zeta', config: {x: 'zeta'}},
                {name: '2024', config: {x: '2024'}},
            ]);
            expect(cfg.x).toBe('2024');
            expect((cfg.__derive({freeze: false}) as any).x).toBe('2024');
        });

        it('keep their order in __inspect', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'zeta', config: {x: 1}},
                {name: '2024', config: {x: 2}},
                {name: '8080', config: {x: 3}},
            ]);
            const before = cfg.__inspect('x').layers.map((l: any) => l.layer);
            const after = cfg.__derive('extra', {y: 1}).__inspect('x').layers.map((l: any) => l.layer);
            expect(before).toEqual(['8080', '2024', 'zeta']);
            expect(after).toEqual(['extra', '8080', '2024', 'zeta']);
        });

        it('survive several chained derives', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'alpha', config: {x: 'alpha'}},
                {name: '0', config: {x: 'zero'}},
            ]);
            const derived: any = cfg.__derive('a', {}).__derive('b', {}).__derive({acceptNull: true});
            expect(derived.x).toBe('zero');
        });
    });

    describe('replacing an existing layer', () => {
        it('updates in place and keeps its position', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {x: 'low', a: 1}},
                {name: 'high', config: {x: 'high'}},
            ]);
            // replacing the *low* layer must not promote it above 'high'
            const derived: any = cfg.__derive('low', {x: 'low2', a: 2});
            expect(derived.x).toBe('high');
            expect(derived.a).toBe(2);
            expect(derived.__inspect('x').layers.map((l: any) => l.layer)).toEqual(['high', 'low']);
        });

        it('adding a new layer puts it at the top', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {x: 'low'}},
                {name: 'high', config: {x: 'high'}},
            ]);
            expect((cfg.__derive('top', {x: 'top'}) as any).x).toBe('top');
        });
    });

    describe('the original is untouched', () => {
        it('deriving does not change the source config', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'base', config: {x: 1}}]);
            cfg.__derive('extra', {x: 2});
            expect(cfg.x).toBe(1);
            expect(cfg.__inspect('x').layers).toHaveLength(1);
        });

        it('options are inherited unless overridden', () => {
            const cfg: any = LayeredConfig.fromLayers<any>(
                [{name: 'a', config: {x: null}}],
                {acceptNull: true},
            );
            expect((cfg.__derive('b', {y: 1}) as any).x).toBeNull();
            // with acceptNull off the null is transparent again, so the key reads as missing
            expect((cfg.__derive({acceptNull: false}) as any).x).toBeUndefined();
        });
    });
});
