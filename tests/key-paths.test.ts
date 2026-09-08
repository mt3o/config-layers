import {describe, expect, it} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * End-to-end coverage of key-path splitting, exercised through the public proxy rather than
 * against the private splitter. The unit-level cases live in the in-source suite in src/index.ts;
 * these pin the behavior that consumers actually observe.
 *
 * The escaping rule: a single `.` separates segments, a run of N >= 2 dots is an escape
 * contributing N-1 literal dots and does not split.
 */
describe('key paths', () => {

    describe('separators', () => {
        it('resolves a single-segment key', () => {
            const cfg = LayeredConfig.fromLayers<any>([{name: 'a', config: {apiUrl: 'x'}}]);
            expect(cfg.apiUrl).toBe('x');
        });

        it('resolves a nested key by dot notation', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {db: {host: 'localhost', port: 5432}}},
            ]);
            expect(cfg['db.host']).toBe('localhost');
            expect(cfg['db.port']).toBe(5432);
        });

        it('resolves a deeply nested key', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {a: {b: {c: {d: 'deep'}}}}},
            ]);
            expect(cfg['a.b.c.d']).toBe('deep');
        });
    });

    describe('escaped dots', () => {
        it('reads a key that itself contains a literal dot', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'special.name': 'escaped'}},
            ]);
            expect(cfg['special..name']).toBe('escaped');
        });

        it('descends into a child of a dotted key', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'a.b': {c: 'nested-under-dotted'}}},
            ]);
            expect(cfg['a..b.c']).toBe('nested-under-dotted');
        });

        it('treats a run of three dots as two literal dots', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'a..b': {c: 'triple'}}},
            ]);
            expect(cfg['a...b.c']).toBe('triple');
        });

        it('handles several escaped dots in one path', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'a.b.c': 'all-literal'}},
            ]);
            expect(cfg['a..b..c']).toBe('all-literal');
        });

        it('mixes separators and escapes in one path', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {a: {'b.c': {d: 'mixed'}}}},
            ]);
            expect(cfg['a.b..c.d']).toBe('mixed');
        });

        it('reads a key made only of dots', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'.': 'one', '..': 'two', '...': 'three'}},
            ]);
            expect(cfg['..']).toBe('one');
            expect(cfg['...']).toBe('two');
            expect(cfg['....']).toBe('three');
        });
    });

    describe('empty segments', () => {
        it('treats a leading dot as an empty first segment', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'': {a: {b: 'leading'}}}},
            ]);
            expect(cfg['.a.b']).toBe('leading');
        });

        it('treats a trailing dot as an empty last segment', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {a: {b: {'': 'trailing'}}}},
            ]);
            expect(cfg['a.b.']).toBe('trailing');
        });
    });

    describe('layer precedence is unaffected by escaping', () => {
        it('later layers win for dotted keys', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {db: {host: 'low'}}},
                {name: 'high', config: {db: {host: 'high'}}},
            ]);
            expect(cfg['db.host']).toBe('high');
        });

        it('later layers win for escaped keys', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {'a.b': 'low'}},
                {name: 'high', config: {'a.b': 'high'}},
            ]);
            expect(cfg['a..b']).toBe('high');
        });
    });

    describe('path caching does not leak between reads', () => {
        it('repeated reads of the same key stay correct', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {a: {b: 'value'}}},
            ]);
            for (let i = 0; i < 5; i++) expect(cfg['a.b']).toBe('value');
        });

        it('the same key resolves identically across separate config instances', () => {
            const first = LayeredConfig.fromLayers<any>([{name: 'a', config: {a: {b: 'first'}}}]);
            const second = LayeredConfig.fromLayers<any>([{name: 'a', config: {a: {b: 'second'}}}]);
            expect(first['a.b']).toBe('first');
            expect(second['a.b']).toBe('second');
            expect(first['a.b']).toBe('first');
        });

        it('a key that only differs by escaping is not confused with its plain form', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'a.b': 'literal', a: {b: 'nested'}}},
            ]);
            expect(cfg['a..b']).toBe('literal');
            expect(cfg['a.b']).toBe('nested');
            // and again, now that both are cached
            expect(cfg['a..b']).toBe('literal');
            expect(cfg['a.b']).toBe('nested');
        });
    });

    describe('the splitter is regex-free (iPhone 6s support)', () => {
        it('resolves keys with characters that are regex metacharacters', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'a(b)': {'c[d]': {'e|f': 'meta'}}}},
            ]);
            expect(cfg['a(b).c[d].e|f']).toBe('meta');
        });

        it('resolves keys containing unicode and astral characters', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {'ключ': {'名前': {'🔑': 'unicode'}}}},
            ]);
            expect(cfg['ключ.名前.🔑']).toBe('unicode');
        });
    });
});
