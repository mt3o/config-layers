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

        it('warns and yields undefined by default in that case', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}]);
                expect(c('missing', undefined)).toBeUndefined();
                expect(warn).toHaveBeenCalledWith('[config-layers] Key not found: missing');
            } finally {
                warn.mockRestore();
            }
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

/**
 * The default `notFoundHandler`: warn, and resolve to `undefined`. It used to throw, so these pin
 * both halves - that a miss is reported, and that it does not take the caller down.
 */
describe('the default not-found handler', () => {

    const warnSpy = () => vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cfg = () => LayeredConfig.fromLayers<any>([{name: 'a', config: {db: {host: 'h'}}}]);

    it('warns and yields undefined for a missing flat key', () => {
        const warn = warnSpy();
        try {
            expect((cfg() as any).nope).toBeUndefined();
            expect(warn).toHaveBeenCalledWith('[config-layers] Key not found: nope');
        } finally { warn.mockRestore(); }
    });

    it('warns and yields undefined for a missing dotted key', () => {
        const warn = warnSpy();
        try {
            expect((cfg() as any)['db.nope']).toBeUndefined();
            expect(warn).toHaveBeenCalledWith('[config-layers] Key not found: db.nope');
        } finally { warn.mockRestore(); }
    });

    it('does not warn when a fallback is supplied', () => {
        const warn = warnSpy();
        try {
            expect((cfg() as any)('nope', 'default')).toBe('default');
            expect(warn).not.toHaveBeenCalled();
        } finally { warn.mockRestore(); }
    });

    it('does not warn for `in`, which asks rather than reads', () => {
        const warn = warnSpy();
        try {
            expect('nope' in cfg()).toBe(false);
            expect('db.nope' in cfg()).toBe(false);
            expect(warn).not.toHaveBeenCalled();
        } finally { warn.mockRestore(); }
    });

    it('warns once per key, however many times it is read', () => {
        // A miss inside a loop would otherwise emit a console.warn per iteration, and that is
        // synchronous I/O.
        const warn = warnSpy();
        try {
            const c: any = cfg();
            for (let i = 0; i < 50; i++) void c.nope;
            expect(warn).toHaveBeenCalledTimes(1);
        } finally { warn.mockRestore(); }
    });

    it('warns separately for each distinct missing key', () => {
        const warn = warnSpy();
        try {
            const c: any = cfg();
            void c.nope; void c.alsoNope; void c['db.nope']; void c.nope;
            expect(warn).toHaveBeenCalledTimes(3);
            expect(warn.mock.calls.map((call) => call[0])).toEqual([
                '[config-layers] Key not found: nope',
                '[config-layers] Key not found: alsoNope',
                '[config-layers] Key not found: db.nope',
            ]);
        } finally { warn.mockRestore(); }
    });

    it('does not let one config silence another', () => {
        // the already-warned set belongs to the config, not to the module
        const warn = warnSpy();
        try {
            void (cfg() as any).nope;
            void (cfg() as any).nope;
            expect(warn).toHaveBeenCalledTimes(2);
        } finally { warn.mockRestore(); }
    });

    it('does not re-warn through a derived config', () => {
        // a derived config inherits the handler with the rest of the options
        const warn = warnSpy();
        try {
            const base: any = cfg();
            void base.nope;
            void base.__derive('extra', {y: 1}).nope;
            expect(warn).toHaveBeenCalledTimes(1);
        } finally { warn.mockRestore(); }
    });

    it('two symbols with the same description are still distinct keys', () => {
        const warn = warnSpy();
        try {
            const c: any = cfg();
            void c[Symbol('dup')];
            void c[Symbol('dup')];
            // symbols never reach notFoundHandler at all - they resolve to undefined silently
            expect(warn).not.toHaveBeenCalled();
        } finally { warn.mockRestore(); }
    });

    it('is inherited by a derived config, and still overridable there', () => {
        const warn = warnSpy();
        try {
            const derived: any = cfg().__derive('extra', {y: 1});
            expect(derived.nope).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);

            const strict: any = cfg().__derive({notFoundHandler: (k: any) => `<<${String(k)}>>`});
            expect(strict.nope).toBe('<<nope>>');
            expect(warn).toHaveBeenCalledTimes(1); // the custom handler replaced the warning
        } finally { warn.mockRestore(); }
    });

    it('can still be made to throw', () => {
        const c: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}], {
            notFoundHandler: (key) => { throw new Error(`Missing config key: ${String(key)}`); },
        });
        expect(() => c.nope).toThrow('Missing config key: nope');
    });
});
