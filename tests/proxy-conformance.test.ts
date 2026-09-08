import {describe, expect, it, vi} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * the config layers handle is a `Proxy`, so it has to behave like an object under every reflection
 * operation, not just under property access. Everything here is reachable from ordinary library
 * code: formatters, deep-equality helpers, DI containers, and serialisers - all reflect on values
 * they are handed.
 */
describe('proxy conformance', () => {

    const cfg = () => LayeredConfig.fromLayers<any>([
        {name: 'base', config: {a: 1, b: {c: 2}, list: ['x']}},
    ]);

    describe('the reflection operations agree with each other', () => {
        it('Object.keys, entries, values and spread report the same thing', () => {
            const c: any = cfg();
            expect(Object.keys(c)).toEqual(['a', 'b', 'list']);
            expect(Object.entries(c)).toEqual([['a', 1], ['b', {c: 2}], ['list', ['x']]]);
            expect(Object.values(c)).toEqual([1, {c: 2}, ['x']]);
            expect({...c}).toEqual({a: 1, b: {c: 2}, list: ['x']});
        });

        it('for...in visits exactly the config keys', () => {
            const seen: string[] = [];
            for (const key in cfg()) seen.push(key);
            expect(seen).toEqual(['a', 'b', 'list']);
        });

        it('getOwnPropertyDescriptor carries the real value', () => {
            // it used to return {enumerable, configurable} with no value at all, so anything
            // reading through descriptors rather than [[Get]] saw undefined for every key
            const d = Object.getOwnPropertyDescriptor(cfg(), 'a');
            expect(d).toEqual({value: 1, writable: false, enumerable: true, configurable: true});
        });

        it('getOwnPropertyDescriptors matches the config', () => {
            const all = Object.getOwnPropertyDescriptors(cfg());
            expect(Object.keys(all)).toEqual(['a', 'b', 'list']);
            expect(all.a.value).toBe(1);
        });

        it('reports nothing for a key the config does not have', () => {
            expect(Object.getOwnPropertyDescriptor(cfg(), 'nope')).toBeUndefined();
        });

        it('`in` agrees with Object.keys', () => {
            const c: any = cfg();
            for (const key of Object.keys(c)) expect(key in c).toBe(true);
            expect('nope' in c).toBe(false);
        });
    });

    describe('the handle is callable, and says so honestly', () => {
        it('typeof is function, because the call form is part of the API', () => {
            expect(typeof cfg()).toBe('function');
        });

        it('name and length answer from the underlying function rather than throwing', () => {
            // anything doing function-shaped introspection reads these
            const c: any = cfg();
            expect(() => c.name).not.toThrow();
            expect(() => c.length).not.toThrow();
            expect(typeof c.length).toBe('number');
        });

        it('a config key called `name` still wins over the function property', () => {
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {name: 'my-service'}}]);
            expect(c.name).toBe('my-service');
        });
    });

    describe('duck-typing sentinels do not throw', () => {
        it.each(['$$typeof', '@@__IMMUTABLE_ITERABLE__@@', '@@iterator', '$$anything'])(
            '%s resolves to undefined',
            (key) => {
                expect((cfg() as any)[key]).toBeUndefined();
            },
        );

        it('but a config key that really is $$-prefixed still resolves', () => {
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {$$custom: 'value'}}]);
            expect(c.$$custom).toBe('value');
        });
    });

    describe('notFoundHandler is reserved for genuine misses', () => {
        it('is not called by any reflection operation', () => {
            const notFoundHandler = vi.fn(() => undefined);
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}], {notFoundHandler});

            Object.keys(c);
            Object.entries(c);
            Object.values(c);
            Object.getOwnPropertyDescriptors(c);
            void {...c};
            for (const _k in c) { /* enumerate */ }
            void ('x' in c);
            JSON.stringify(c);
            String(c);

            expect(notFoundHandler).not.toHaveBeenCalled();
        });
    });

    describe('the handle refuses writes', () => {
        it('assignment fails', () => {
            const c: any = cfg();
            expect(() => { c.a = 99; }).toThrow();
            expect(c.a).toBe(1);
        });

        it('deletion fails', () => {
            const c: any = cfg();
            expect(() => { delete c.a; }).toThrow();
            expect(c.a).toBe(1);
        });

        it('defineProperty fails', () => {
            const c: any = cfg();
            expect(() => Object.defineProperty(c, 'z', {value: 1})).toThrow();
        });

        it('adding an entirely new key fails', () => {
            const c: any = cfg();
            expect(() => { c.brandNew = 1; }).toThrow();
        });
    });
});
