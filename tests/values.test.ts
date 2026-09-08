import {describe, expect, it, vi} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * values that are easy to break by accident
 */
describe('values', () => {

    describe('falsy values are values, not misses', () => {
        const cfg = () => LayeredConfig.fromLayers<any>([{
            name: 'a',
            config: {zero: 0, no: false, empty: '', nan: NaN, nested: {zero: 0, no: false, empty: ''}},
        }]);

        it('returns 0 rather than the fallback', () => {
            expect(cfg()('zero', 99)).toBe(0);
            expect((cfg() as any).zero).toBe(0);
        });

        it('returns false rather than the fallback', () => {
            expect(cfg()('no', true)).toBe(false);
            expect((cfg() as any).no).toBe(false);
        });

        it('returns the empty string rather than the fallback', () => {
            expect(cfg()('empty', 'x')).toBe('');
            expect((cfg() as any).empty).toBe('');
        });

        it('returns NaN rather than the fallback', () => {
            expect(cfg()('nan', 1)).toBeNaN();
        });

        it('holds for dotted paths too', () => {
            expect(cfg()('nested.zero', 99)).toBe(0);
            expect(cfg()('nested.no', true)).toBe(false);
            expect(cfg()('nested.empty', 'x')).toBe('');
        });

        it('a falsy value in a higher layer still overrides a truthy one below', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {debug: true, retries: 5, prefix: 'x'}},
                {name: 'high', config: {debug: false, retries: 0, prefix: ''}},
            ]);
            expect(c.debug).toBe(false);
            expect(c.retries).toBe(0);
            expect(c.prefix).toBe('');
        });

        it('`in` reports a falsy key as present', () => {
            expect('zero' in cfg()).toBe(true);
            expect('no' in cfg()).toBe(true);
            expect('empty' in cfg()).toBe(true);
        });
    });

    describe('value types beyond JSON', () => {
        const sym = Symbol('marker');
        const fn = () => 'called';
        const cfg = () => LayeredConfig.fromLayers<any>([{
            name: 'a',
            config: {big: 10n, sym, fn, when: new Date('2020-01-01T00:00:00Z'), re: /x/g, inf: Infinity, negZero: -0},
        }]);

        it('carries a bigint', () => {
            expect((cfg() as any).big).toBe(10n);
        });

        it('carries a symbol value', () => {
            expect((cfg() as any).sym).toBe(sym);
        });

        it('carries a callable function', () => {
            expect((cfg() as any).fn()).toBe('called');
        });

        it('carries Infinity and -0', () => {
            expect((cfg() as any).inf).toBe(Infinity);
            expect(Object.is((cfg() as any).negZero, -0)).toBe(true);
        });

        it('carries Date and RegExp with their behaviour intact', () => {
            expect((cfg() as any).when.getUTCFullYear()).toBe(2020);
            expect((cfg() as any).re.test('x')).toBe(true);
        });
    });

    describe('the transparency rule', () => {
        it('a key present below and null above resolves to the lower value', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: 'kept'}},
                {name: 'high', config: {a: null}},
            ]);
            expect(c.a).toBe('kept');
        });

        it('a key present below and undefined above resolves to the lower value', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: 'kept'}},
                {name: 'high', config: {a: undefined}},
            ]);
            expect(c.a).toBe('kept');
        });

        it('null wins when acceptNull is on', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: 'shadowed'}},
                {name: 'high', config: {a: null}},
            ], {acceptNull: true});
            expect(c.a).toBeNull();
        });

        it('undefined wins when acceptUndefined is on', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: 'shadowed'}},
                {name: 'high', config: {a: undefined}},
            ], {acceptUndefined: true});
            expect(c.a).toBeUndefined();
            expect('a' in c).toBe(false); // `in` treats undefined as absent
        });

        it('holds one level down as well', () => {
            const c: any = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {db: {host: 'kept', port: 1}}},
                {name: 'high', config: {db: {host: null}}},
            ]);
            expect(c['db.host']).toBe('kept');
            expect(c['db.port']).toBe(1);
        });
    });

    describe('calling with an explicit undefined fallback', () => {
        // The fallback is detected with `fallback !== undefined`, so passing undefined explicitly
        // is indistinguishable from passing nothing and the miss goes to notFoundHandler.
        it('falls through to notFoundHandler rather than returning undefined', () => {
            const notFoundHandler = vi.fn(() => 'from handler');
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}], {notFoundHandler});
            expect(c('missing', undefined)).toBe('from handler');
            expect(notFoundHandler).toHaveBeenCalledWith('missing');
        });

        it('throws by default in that case', () => {
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}]);
            expect(() => c('missing', undefined)).toThrow('Key not found: missing');
        });

        it('a falsy fallback is still honoured', () => {
            const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}]);
            expect(c('missing', 0)).toBe(0);
            expect(c('missing', false)).toBe(false);
            expect(c('missing', '')).toBe('');
        });
    });
});

/**
 * Values that cannot take an `Object.freeze`. Both of these crashed once `deepFreeze` stopped
 * skipping non-plain objects, so they are pinned rather than left to be rediscovered.
 */
describe('values that cannot be frozen', () => {

    it('a Buffer in a layer does not crash construction', () => {
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {buf: Buffer.from('hi')}}]);
        expect(cfg.buf).toBeInstanceOf(Buffer);
        expect(cfg.buf.toString()).toBe('hi');
    });

    it('a typed array in a layer does not crash construction', () => {
        // Object.freeze on an ArrayBuffer view with elements throws TypeError
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {bytes: new Uint8Array([1, 2, 3])}}]);
        expect(cfg.bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(cfg.bytes)).toEqual([1, 2, 3]);
    });

    it('a typed array is copied, not shared with the layer', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {bytes}}]);
        bytes[0] = 99;
        expect(cfg.bytes[0]).toBe(1);
    });

    it('a global regex stays usable', () => {
        // test/exec write lastIndex, which a frozen regex would reject
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {re: /x/g}}]);
        expect(cfg.re.test('x')).toBe(true);
        expect(cfg.re.flags).toBe('g');
    });

    it('a sticky regex stays usable', () => {
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {re: /a/y}}]);
        expect(cfg.re.exec('abc')?.[0]).toBe('a');
    });

    it('a regex is still copied, so the layer\'s lastIndex is independent', () => {
        const re = /x/g;
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {re}}]);
        cfg.re.test('xx');
        expect(re.lastIndex).toBe(0);
    });
});
