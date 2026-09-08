import {afterEach, describe, expect, it} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * Covers what `deepMerge` is allowed to do to the values it is handed:
 *  - it must never write through a key that reaches `Object.prototype`
 *  - it must not destroy values it cannot meaningfully merge (Date, Map, class instances, ...)
 *  - it must not throw when two layers disagree about the shape of a key
 */
describe('merge safety', () => {

    describe('prototype pollution', () => {
        // Anything that leaks onto Object.prototype would silently affect every other test,
        // so clean up defensively even when an assertion fails.
        afterEach(() => {
            for (const k of ['polluted', 'pwned', 'nested']) delete (Object.prototype as any)[k];
        });

        it('ignores a __proto__ key coming from parsed JSON', () => {
            const malicious = JSON.parse('{"__proto__": {"polluted": "yes"}}');
            LayeredConfig.fromLayers<any>([{name: 'evil', config: malicious}]);
            expect(({} as any).polluted).toBeUndefined();
        });

        it('ignores a constructor.prototype key coming from parsed JSON', () => {
            const malicious = JSON.parse('{"constructor": {"prototype": {"pwned": 1}}}');
            LayeredConfig.fromLayers<any>([{name: 'evil', config: malicious}]);
            expect(({} as any).pwned).toBeUndefined();
        });

        it('ignores __proto__ nested inside an otherwise ordinary layer', () => {
            const malicious = JSON.parse('{"db": {"__proto__": {"nested": "yes"}, "host": "h"}}');
            const cfg = LayeredConfig.fromLayers<any>([{name: 'evil', config: malicious}]);
            expect(({} as any).nested).toBeUndefined();
            // the legitimate sibling key still merges
            expect(cfg['db.host']).toBe('h');
        });

        it('ignores __proto__ arriving through __derive', () => {
            const base = LayeredConfig.fromLayers<any>([{name: 'base', config: {a: 1}}]);
            base.__derive('evil', JSON.parse('{"__proto__": {"polluted": "yes"}}'));
            expect(({} as any).polluted).toBeUndefined();
        });

        it('ignores __proto__ arriving through fromLayersAsync', async () => {
            await LayeredConfig.fromLayersAsync<any>([
                {name: 'evil', config: Promise.resolve(JSON.parse('{"__proto__": {"polluted": "yes"}}'))},
            ]);
            expect(({} as any).polluted).toBeUndefined();
        });
    });

    describe('values that cannot be merged key-by-key are preserved', () => {
        class Creds {
            constructor(public user = 'u', public pass = 'p') {}
            describe() { return `${this.user}:${this.pass}`; }
        }

        it('keeps a Date as a Date', () => {
            const when = new Date('2020-01-01T00:00:00Z');
            const cfg = LayeredConfig.fromLayers<any>([{name: 'a', config: {when}}]);
            expect(cfg.when).toBeInstanceOf(Date);
            expect(cfg.when.getTime()).toBe(when.getTime());
        });

        it('keeps RegExp, Map and Set intact', () => {
            const cfg = LayeredConfig.fromLayers<any>([{
                name: 'a',
                config: {re: /abc/g, map: new Map([['k', 1]]), set: new Set([1, 2])},
            }]);
            expect(cfg.re).toBeInstanceOf(RegExp);
            expect(cfg.re.source).toBe('abc');
            expect(cfg.map).toBeInstanceOf(Map);
            expect(cfg.map.get('k')).toBe(1);
            expect(cfg.set).toBeInstanceOf(Set);
            expect(cfg.set.has(2)).toBe(true);
        });

        it('keeps a class instance, including its prototype and methods', () => {
            const cfg = LayeredConfig.fromLayers<any>([{name: 'a', config: {creds: new Creds('alice', 's3cret')}}]);
            expect(cfg.creds).toBeInstanceOf(Creds);
            expect(cfg.creds.describe()).toBe('alice:s3cret');
        });

        it('keeps functions callable', () => {
            const cfg = LayeredConfig.fromLayers<any>([{name: 'a', config: {password: () => 'from-vault'}}]);
            expect(cfg.password()).toBe('from-vault');
        });

        it('preserves non-plain values nested inside plain objects', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {db: {connectedAt: new Date('2021-06-01T00:00:00Z'), host: 'h'}}},
            ]);
            expect(cfg['db.connectedAt']).toBeInstanceOf(Date);
            expect(cfg.db.connectedAt).toBeInstanceOf(Date);
        });

        it('still merges genuinely plain objects deeply', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {db: {host: 'low', port: 1}}},
                {name: 'high', config: {db: {host: 'high'}}},
            ]);
            expect(cfg.db).toEqual({host: 'high', port: 1});
        });

        it('merges null-prototype objects as plain objects', () => {
            const bare = Object.create(null);
            bare.host = 'bare';
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {db: {port: 1}}},
                {name: 'high', config: {db: bare}},
            ]);
            expect(cfg.db).toEqual({host: 'bare', port: 1});
        });

        it('a later plain object replaces an earlier non-plain value rather than merging into it', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {creds: new Creds('alice', 's3cret')}},
                {name: 'high', config: {creds: {user: 'bob'}}},
            ]);
            expect(cfg.creds).toEqual({user: 'bob'});
            expect(cfg.creds).not.toBeInstanceOf(Creds);
        });
    });

    describe('layers that disagree about the shape of a key', () => {
        it('does not throw when an object overrides a string', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: 'i am a string'}},
                {name: 'high', config: {a: {b: 1}}},
            ]);
            expect(cfg.a).toEqual({b: 1});
            expect(cfg['a.b']).toBe(1);
        });

        it('does not throw when an object overrides a number', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: 42}},
                {name: 'high', config: {a: {b: 1}}},
            ]);
            expect(cfg.a).toEqual({b: 1});
        });

        it('does not throw when an object overrides an array', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: [1, 2, 3]}},
                {name: 'high', config: {a: {b: 1}}},
            ]);
            expect(cfg.a).toEqual({b: 1});
        });

        it('lets a scalar override an object', () => {
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'low', config: {a: {b: 1}}},
                {name: 'high', config: {a: 'i am a string'}},
            ]);
            expect(cfg.a).toBe('i am a string');
        });

        it('does not treat an inherited key name as an existing target value', () => {
            // 'toString' exists on Object.prototype; the merge must not recurse into that function
            const cfg = LayeredConfig.fromLayers<any>([
                {name: 'a', config: JSON.parse('{"toString": {"nested": true}}')},
            ]);
            expect(cfg.toString).toEqual({nested: true});
        });
    });

    describe('freezing does not reach into caller-owned values', () => {
        it('leaves a Date in a layer unfrozen', () => {
            const when = new Date('2020-01-01T00:00:00Z');
            LayeredConfig.fromLayers<any>([{name: 'a', config: {when}}], {freeze: true});
            expect(Object.isFrozen(when)).toBe(false);
        });

        it('leaves a Map in a layer usable', () => {
            const map = new Map<string, number>();
            const cfg = LayeredConfig.fromLayers<any>([{name: 'a', config: {map}}], {freeze: true});
            expect(() => cfg.map.set('k', 1)).not.toThrow();
            expect(cfg.map.get('k')).toBe(1);
        });

        it('still freezes the merged plain-object spine', () => {
            const cfg = LayeredConfig.fromLayers<any>([{name: 'a', config: {db: {host: 'h'}}}], {freeze: true});
            expect(Object.isFrozen(cfg.db)).toBe(true);
        });
    });
});
