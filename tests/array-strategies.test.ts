import {describe, expect, it} from 'vitest';
import {LayeredConfig} from '../src';

/**
 *  the array merge strategies beyond the happy path already covered by
 * `tests/array-merge.test.ts`: shape mismatches, three or more layers, bad strategy values, and
 *  how the local-strategy marker field itself behaves.
 */
describe('array merge strategies', () => {

    describe('across three or more layers', () => {
        it('concat accumulates through every layer in order', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a']}},
                {name: 'b', config: {tags: ['b']}},
                {name: 'c', config: {tags: ['c']}},
                {name: 'd', config: {tags: ['d']}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg.tags).toEqual(['a', 'b', 'c', 'd']);
        });

        it('union de-duplicates across every layer, keeping first-seen order', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a', 'b']}},
                {name: 'b', config: {tags: ['b', 'c']}},
                {name: 'c', config: {tags: ['a', 'd']}},
            ], {arrayMergeStrategy: 'union'});
            expect(cfg.tags).toEqual(['a', 'b', 'c', 'd']);
        });

        it('override keeps only the last layer', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a']}},
                {name: 'b', config: {tags: ['b']}},
                {name: 'c', config: {tags: ['c']}},
            ]);
            expect(cfg.tags).toEqual(['c']);
        });
    });

    describe('union with non-primitive elements', () => {
        it('does not de-duplicate structurally equal objects', () => {
            // Set membership is by reference, so two identical-looking objects are both kept.
            // Documented here because "union" invites the opposite expectation.
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {items: [{id: 1}]}},
                {name: 'b', config: {items: [{id: 1}]}},
            ], {arrayMergeStrategy: 'union'});
            expect(cfg.items).toEqual([{id: 1}, {id: 1}]);
        });

        it('de-duplicates the same reference appearing in two layers', () => {
            // The union runs during the fold, while the layers' own references are still in play,
            // so Set sees one object twice and collapses it. Copying happens afterwards.
            const shared = {id: 1};
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {items: [shared]}},
                {name: 'b', config: {items: [shared]}},
            ], {arrayMergeStrategy: 'union'});
            expect(cfg.items).toEqual([{id: 1}]);
            // ...and the survivor is still a copy, not the caller's object
            expect(cfg.items[0]).not.toBe(shared);
        });

        it('de-duplicates primitives of mixed type by strict identity', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {mixed: [1, '1', true]}},
                {name: 'b', config: {mixed: [1, '1', false]}},
            ], {arrayMergeStrategy: 'union'});
            expect(cfg.mixed).toEqual([1, '1', true, false]);
        });
    });

    describe('shape mismatches between layers', () => {
        it('a scalar in a later layer replaces an array', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {v: ['x', 'y']}},
                {name: 'b', config: {v: 'scalar'}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg.v).toBe('scalar');
        });

        it('an array in a later layer replaces a scalar', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {v: 'scalar'}},
                {name: 'b', config: {v: ['x']}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg.v).toEqual(['x']);
        });

        it('an object in a later layer replaces an array', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {v: ['x']}},
                {name: 'b', config: {v: {k: 1}}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg.v).toEqual({k: 1});
        });

        it('a null in a later layer is transparent, leaving the array intact', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {v: ['x']}},
                {name: 'b', config: {v: null}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg.v).toEqual(['x']);
        });
    });

    describe('the local strategy marker', () => {
        const opts = {arrayMergeStrategy: 'concat' as const, arrayLocalMergeStrategyNameSuffix: 'Strategy'};

        it('a local override beats the global strategy', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a'], tagsStrategy: 'override'}},
                {name: 'b', config: {tags: ['b']}},
            ], opts);
            expect(cfg.tags).toEqual(['b']);
        });

        it('an unrecognised strategy value falls back to override', () => {
            // documenting current behaviour: a typo silently degrades rather than throwing
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a'], tagsStrategy: 'unio'}},
                {name: 'b', config: {tags: ['b']}},
            ], opts);
            expect(cfg.tags).toEqual(['b']);
        });

        it('the marker field is itself a config key and stays visible', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a'], tagsStrategy: 'union'}},
                {name: 'b', config: {tags: ['b']}},
            ], opts);
            expect(cfg.tagsStrategy).toBe('union');
            expect(Object.keys(cfg)).toContain('tagsStrategy');
        });

        it('works on a nested array, with the marker beside it', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {svc: {tags: ['a'], tagsStrategy: 'union'}}},
                {name: 'b', config: {svc: {tags: ['a', 'b']}}},
            ], opts);
            expect(cfg['svc.tags']).toEqual(['a', 'b']);
        });

        it('is ignored when no suffix is configured', () => {
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a'], tagsStrategy: 'override'}},
                {name: 'b', config: {tags: ['b']}},
            ], {arrayMergeStrategy: 'concat'});
            expect(cfg.tags).toEqual(['a', 'b']);
        });
    });

    describe('interaction with ownership and freezing', () => {
        it('a concat result is frozen and independent of both source arrays', () => {
            const first = ['a'];
            const second = ['b'];
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: first}},
                {name: 'b', config: {tags: second}},
            ], {arrayMergeStrategy: 'concat'});

            expect(cfg.tags).toEqual(['a', 'b']);
            expect(Object.isFrozen(cfg.tags)).toBe(true);
            expect(Object.isFrozen(first)).toBe(false);
            expect(Object.isFrozen(second)).toBe(false);

            first.push('mutated');
            second.push('mutated');
            expect(cfg.tags).toEqual(['a', 'b']);
        });

        it('an override result does not alias the winning layer', () => {
            const winning = ['b'];
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {tags: ['a']}},
                {name: 'b', config: {tags: winning}},
            ]);
            expect(cfg.tags).not.toBe(winning);
            winning.push('mutated');
            expect(cfg.tags).toEqual(['b']);
        });

        it('objects inside a merged array are copied too', () => {
            const item = {id: 1};
            const cfg: any = LayeredConfig.fromLayers<any>([
                {name: 'a', config: {items: [item]}},
            ], {arrayMergeStrategy: 'concat'});

            expect(cfg.items[0]).not.toBe(item);
            expect(Object.isFrozen(cfg.items[0])).toBe(true);
            expect(Object.isFrozen(item)).toBe(false);
        });
    });
});
