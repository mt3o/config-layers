import {describe, expect, it} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * Flat access (`cfg.a.b`) and dotted access (`cfg['a.b']`) must be the same operation.
 *
 */
describe('resolution', () => {

    const layered = () => LayeredConfig.fromLayers<any>([
        {name: 'low', config: {db: {opts: {x: 1, y: 1}}, a: {b: {deep: {p: 1, q: 1}}}, s: {list: ['a', 'b']}}},
        {name: 'high', config: {db: {opts: {x: 2}}, a: {b: {deep: {p: 2}}}, s: {list: ['c']}}},
    ]);

    describe('flat and dotted access agree', () => {
        it('on an object one level down', () => {
            const cfg: any = layered();
            expect(cfg['db.opts']).toEqual({x: 2, y: 1});
            expect(cfg['db.opts']).toEqual(cfg.db.opts);
        });

        it('on a deeply nested object, merged all the way down', () => {
            const cfg: any = layered();
            expect(cfg['a.b']).toEqual({deep: {p: 2, q: 1}});
            expect(cfg['a.b']).toEqual(cfg.a.b);
        });

        it('the higher-priority layer wins, not the lower one', () => {
            const cfg: any = layered();
            expect(cfg['db.opts'].x).toBe(2);
            expect(cfg['db.opts.x']).toBe(2);
        });
    });

    describe('arrays stay arrays', () => {
        it('a dotted path to an array returns a real array', () => {
            const cfg: any = layered();
            expect(Array.isArray(cfg['s.list'])).toBe(true);
            expect(cfg['s.list']).toEqual(['c']);
        });

        it('an empty array resolves rather than reading as missing', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {s: {list: []}}}]);
            expect(cfg['s.list']).toEqual([]);
        });

        it('array merge strategies apply to dotted access too', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {s: {tags: ['a', 'b']}}},
                {name: 'b', config: {s: {tags: ['c']}}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg['s.tags']).toEqual(['a', 'b', 'c']);
            expect(cfg['s.tags']).toEqual(cfg.s.tags);
        });
    });

    describe('empty objects', () => {
        it('resolve rather than reading as missing', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {e: {obj: {}}}}]);
            expect(cfg['e.obj']).toEqual({});
        });
    });

    describe('resolved values are stable', () => {
        it('repeated reads return the same object, not a fresh one', () => {
            const cfg: any = layered();
            expect(cfg['db.opts']).toBe(cfg['db.opts']);
        });

        it('the object a dotted path returns is frozen', () => {
            const cfg: any = layered();
            expect(Object.isFrozen(cfg['db.opts'])).toBe(true);
        });

        it('mutating a source layer afterwards changes nothing', () => {
            const layer: any = {db: {host: 'orig'}, list: ['x']};
            const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: layer}]);

            layer.db.host = 'MUTATED';
            layer.list.push('y');
            layer.newKey = 'appeared';

            expect(cfg.db.host).toBe('orig');
            expect(cfg['db.host']).toBe('orig');
            expect(cfg.list).toEqual(['x']);
            expect(() => cfg.newKey).toThrow();
        });
    });

    describe('a key path addresses data, never the prototype chain', () => {
        it.each(['constructor.name', 'toString.name', '__proto__.x', 'constructor.prototype'])(
            'cfg[%o] does not resolve',
            (path) => {
                const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {x: 1}}]);
                expect(() => cfg[path]).toThrow();
            },
        );
    });

    describe('fallbacks and misses still behave', () => {
        it('a fallback is used for a missing dotted path', () => {
            const cfg: any = layered();
            expect(cfg('db.nope', 'fallback')).toBe('fallback');
        });

        it('a present dotted path ignores the fallback', () => {
            const cfg: any = layered();
            expect(cfg('db.opts.x', 999)).toBe(2);
        });

        it('falsy values are returned, not treated as missing', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {n: {zero: 0, no: false, empty: ''}}},
            ]);
            expect(cfg('n.zero', 99)).toBe(0);
            expect(cfg('n.no', true)).toBe(false);
            expect(cfg('n.empty', 'x')).toBe('');
        });

        it('`in` works for both flat and dotted keys', () => {
            const cfg: any = layered();
            expect('db' in cfg).toBe(true);
            expect('db.opts' in cfg).toBe(true);
            expect('db.opts.x' in cfg).toBe(true);
            expect('db.nope' in cfg).toBe(false);
        });
    });
});

/**
 * The `freeze` option's exact contract, as documented in the README's "Freeze" section.
 */
describe('freeze contract', () => {

    class Creds {
        user: string;
        constructor(user = 'u') {
            this.user = user;
        }
        describe() { return `user=${this.user}`; }
    }

    it('does not freeze the caller\'s arrays or the objects inside them', () => {
        const inner = {deep: 1};
        const arr: any[] = ['a', {nested: 'b'}, [inner]];
        const layer = {list: arr};

        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: layer}], {freeze: true});

        expect(Object.isFrozen(arr)).toBe(false);
        expect(Object.isFrozen(arr[1])).toBe(false);
        expect(Object.isFrozen(inner)).toBe(false);
        // the config's own copy is frozen, and is a copy
        expect(Object.isFrozen(cfg.list)).toBe(true);
        expect(cfg.list).not.toBe(arr);
        expect(cfg.list).toEqual(['a', {nested: 'b'}, [{deep: 1}]]);
    });

    it('does not freeze the caller\'s layer objects', () => {
        const layer = {db: {host: 'h'}};
        LayeredConfig.fromLayers<any>([{name: 'a', config: layer}], {freeze: true});
        expect(Object.isFrozen(layer)).toBe(false);
        expect(Object.isFrozen(layer.db)).toBe(false);
    });

    it('copies Date, RegExp, Map and Set instead of sharing them', () => {
        const when = new Date('2020-01-01T00:00:00Z');
        const re = /abc/gi;
        const map = new Map([['k', 1]]);
        const set = new Set([1, 2]);

        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {when, re, map, set}}]);

        // same value, different object
        expect(cfg.when).toBeInstanceOf(Date);
        expect(cfg.when.getTime()).toBe(when.getTime());
        expect(cfg.when).not.toBe(when);

        expect(cfg.re).toBeInstanceOf(RegExp);
        expect(cfg.re.source).toBe('abc');
        expect(cfg.re.flags).toBe('gi');
        expect(cfg.re).not.toBe(re);

        expect(cfg.map).toBeInstanceOf(Map);
        expect(cfg.map.get('k')).toBe(1);
        expect(cfg.map).not.toBe(map);

        expect(cfg.set).toBeInstanceOf(Set);
        expect(cfg.set.has(2)).toBe(true);
        expect(cfg.set).not.toBe(set);

        // the originals are untouched
        expect(Object.isFrozen(when)).toBe(false);
        expect(Object.isFrozen(map)).toBe(false);
    });

    it('copies class instances, keeping the prototype and methods', () => {
        const creds = new Creds('alice');
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {creds}}]);

        expect(cfg.creds).toBeInstanceOf(Creds);
        expect(cfg.creds.describe()).toBe('user=alice');
        expect(cfg.creds).not.toBe(creds);
        expect(Object.isFrozen(creds)).toBe(false);
        expect(Object.isFrozen(cfg.creds)).toBe(true);
    });

    it('mutating the caller\'s Date or Map afterwards does not reach the config', () => {
        const when = new Date('2020-01-01T00:00:00Z');
        const map = new Map([['k', 1]]);
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {when, map}}]);

        when.setFullYear(1999);
        map.set('k', 999);

        expect(cfg.when.getFullYear()).toBe(2020);
        expect(cfg.map.get('k')).toBe(1);
    });

    it('shares functions by reference, since a closure cannot be cloned', () => {
        const password = () => 'from-vault';
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {password}}]);
        expect(cfg.password).toBe(password);
        expect(cfg.password()).toBe('from-vault');
    });

    it('freezes what it can, but internal slots stay writable', () => {
        // Object.freeze cannot reach state held in internal slots. The copy means such a write
        // can no longer affect the caller, but it does still mutate the config's own value.
        const cfg: any = LayeredConfig.fromLayers<any>([
            {name: 'a', config: {map: new Map([['k', 1]]), when: new Date('2020-01-01T00:00:00Z')}},
        ]);
        expect(Object.isFrozen(cfg.map)).toBe(true);
        expect(() => cfg.map.set('k', 2)).not.toThrow();
        expect(() => cfg.when.setFullYear(1999)).not.toThrow();
    });

    it('freeze: false still does not share the caller\'s arrays', () => {
        const arr = ['a', 'b'];
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: {list: arr}}], {freeze: false});
        arr.push('c');
        expect(cfg.list).toEqual(['a', 'b']);
        expect(Object.isFrozen(cfg.list)).toBe(false);
    });

    it('__inspect still reports per-layer provenance from the layer objects', () => {
        const layer: any = {host: 'orig'};
        const cfg: any = LayeredConfig.fromLayers<any>([{name: 'a', config: layer}]);
        layer.host = 'MUTATED';
        // resolution is a snapshot...
        expect(cfg.host).toBe('orig');
        // ...while inspection reads the layers, as documented
        expect(cfg.__inspect('host').resolved.value).toBe('MUTATED');
    });
});
