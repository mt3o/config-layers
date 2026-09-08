import {describe, expect, it, vi} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * The language, `JSON.stringify` and various libraries probe well-known keys on any object handed
 * to them. None of them is a config key, so a miss must answer quietly rather than reach
 * `notFoundHandler` - otherwise ordinary things like string coercion blow up.
 */
describe('protocol lookups', () => {

    const cfg = () => LayeredConfig.fromLayers<any>([
        {name: 'base', config: {x: 1, db: {host: 'h', port: 5432}}},
    ]);

    describe('coercion does not throw', () => {
        it('String(config)', () => {
            expect(String(cfg())).toBe('[object LayeredConfig]');
        });

        it('template interpolation', () => {
            expect(`${cfg()}`).toBe('[object LayeredConfig]');
        });

        it('Object.prototype.toString reports a useful tag', () => {
            expect(Object.prototype.toString.call(cfg())).toBe('[object LayeredConfig]');
        });
    });

    describe('serialisation', () => {
        it('JSON.stringify returns the resolved config', () => {
            expect(JSON.parse(JSON.stringify(cfg()))).toEqual({x: 1, db: {host: 'h', port: 5432}});
        });

        it('toJSON() is callable directly', () => {
            expect((cfg() as any).toJSON()).toEqual({x: 1, db: {host: 'h', port: 5432}});
        });

        it('spread and Object.keys agree with it', () => {
            expect({...cfg()}).toEqual({x: 1, db: {host: 'h', port: 5432}});
            expect(Object.keys(cfg())).toEqual(['x', 'db']);
        });
    });

    describe('unknown symbols resolve to undefined, not an error', () => {
        it.each([
            ['Symbol.toPrimitive', Symbol.toPrimitive],
            ['Symbol.iterator', Symbol.iterator],
            ['Symbol.asyncIterator', Symbol.asyncIterator],
            ['Symbol.hasInstance', Symbol.hasInstance],
            ['a user-defined symbol', Symbol('whatever')],
            ['nodejs.util.inspect.custom', Symbol.for('nodejs.util.inspect.custom')],
        ])('%s', (_label, sym) => {
            expect((cfg() as any)[sym]).toBeUndefined();
        });
    });

    describe('notFoundHandler is reserved for genuine misses', () => {
        it('is not called by coercion or serialisation', () => {
            const notFoundHandler = vi.fn(() => 'fallback');
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}], {notFoundHandler});

            String(c);
            JSON.stringify(c);
            Object.keys(c);
            void c[Symbol.toPrimitive];
            void c.then;

            expect(notFoundHandler).not.toHaveBeenCalled();
        });

        it('is still called for a real missing key', () => {
            const notFoundHandler = vi.fn(() => 'fallback');
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}], {notFoundHandler});
            expect(c.doesNotExist).toBe('fallback');
            expect(notFoundHandler).toHaveBeenCalledWith('doesNotExist');
        });

        it('warns and resolves to undefined by default', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                expect((cfg() as any).doesNotExist).toBeUndefined();
                expect(warn).toHaveBeenCalledWith('[config-layers] Key not found: doesNotExist');
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('a layer that defines these names wins', () => {
        it('config data shadows the built-in toJSON and toString', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {toJSON: 'i am data', toString: 'also data', valueOf: 'me too'}},
            ]);
            expect(c.toJSON).toBe('i am data');
            expect(c.toString).toBe('also data');
            expect(c.valueOf).toBe('me too');
        });
    });

    describe('await', () => {
        it('the handle is not mistaken for a thenable', async () => {
            const c: any = cfg();
            expect(c.then).toBeUndefined();
            expect(await c).toBe(c);
        });

        it('but a config key really called `then` still resolves', () => {
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {then: 'a value'}}]);
            expect(c.then).toBe('a value');
        });
    });
});
