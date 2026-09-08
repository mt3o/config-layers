import {describe, expect, it, vi} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * parts of `fromLayersAsync` that `tests/async.test.ts` does not reach: what happens
 * when layers settle out of order, when one rejects, and when a layer resolves to nothing.
 */
describe('fromLayersAsync', () => {

    const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

    describe('ordering', () => {
        it('precedence follows array order, not the order the promises settle in', async () => {
            // the low-priority layer resolves last, the high-priority one first
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'low', config: after(30, {host: 'low', onlyLow: true})},
                {name: 'high', config: after(1, {host: 'high'})},
            ]);

            expect(cfg.host).toBe('high');
            expect(cfg.onlyLow).toBe(true);
        });

        it('holds for three layers settling in reverse', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'a', config: after(30, {v: 'a', a: 1})},
                {name: 'b', config: after(20, {v: 'b', b: 2})},
                {name: 'c', config: after(10, {v: 'c', c: 3})},
            ]);

            expect(cfg.v).toBe('c');
            // asserted key by key rather than with toMatchObject: the handle is callable, so
            // `typeof cfg === 'function'` and object-shaped matchers do not apply to it
            expect({...cfg}).toEqual({v: 'c', a: 1, b: 2, c: 3});
        });

        it('__inspect reports layers in declaration order', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'slow', config: after(20, {v: 1})},
                {name: 'fast', config: after(1, {v: 2})},
            ]);
            expect(cfg.__inspect('v').layers.map((l: any) => l.layer)).toEqual(['fast', 'slow']);
        });
    });

    describe('rejection', () => {
        it('rejects when a layer rejects', async () => {
            await expect(LayeredConfig.fromLayersAsync<any>([
                {name: 'ok', config: {a: 1}},
                {name: 'bad', config: Promise.reject(new Error('layer exploded'))},
            ])).rejects.toThrow('layer exploded');
        });

        it('surfaces the first rejection when several fail', async () => {
            await expect(LayeredConfig.fromLayersAsync<any>([
                {name: 'bad1', config: Promise.reject(new Error('first'))},
                {name: 'bad2', config: Promise.reject(new Error('second'))},
            ])).rejects.toThrow('first');
        });

        it('builds no config at all when one layer rejects', async () => {
            // the good layer must not leak out as a partially-built config
            const built = vi.fn();
            await LayeredConfig.fromLayersAsync<any>([
                {name: 'ok', config: {a: 1}},
                {name: 'bad', config: Promise.reject(new Error('nope'))},
            ]).then(built, () => undefined);
            expect(built).not.toHaveBeenCalled();
        });
    });

    describe('layers that resolve to nothing much', () => {
        it('an async layer resolving to null is transparent by default', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'base', config: {a: 1}},
                {name: 'over', config: after(1, {a: null})},
            ]);
            expect(cfg.a).toBe(1);
        });

        it('an async layer resolving to undefined is transparent by default', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'base', config: {a: 1}},
                {name: 'over', config: after(1, {a: undefined})},
            ]);
            expect(cfg.a).toBe(1);
        });

        it('an async layer resolving to an empty object contributes nothing', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'base', config: {a: 1}},
                {name: 'empty', config: after(1, {})},
            ]);
            expect(cfg.a).toBe(1);
        });

        it('accepts an empty layer list', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([]);
            expect(Object.keys(cfg)).toEqual([]);
        });
    });

    describe('the result is a normal config handle', () => {
        it('is frozen and owns its values like the sync form', async () => {
            const arr = ['a'];
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'a', config: after(1, {list: arr, when: new Date('2020-01-01T00:00:00Z')})},
            ]);
            arr.push('b');
            expect(cfg.list).toEqual(['a']);
            expect(Object.isFrozen(cfg.list)).toBe(true);
            expect(cfg.when).toBeInstanceOf(Date);
        });

        it('resolves dotted paths identically to flat access', async () => {
            const cfg: any = await LayeredConfig.fromLayersAsync<any>([
                {name: 'low', config: after(5, {db: {host: 'low', port: 1}})},
                {name: 'high', config: after(1, {db: {host: 'high'}})},
            ]);
            expect(cfg['db.host']).toBe('high');
            expect(cfg['db.port']).toBe(1);
            expect(cfg['db.host']).toBe(cfg.db.host);
        });
    });
});
