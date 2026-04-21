import { describe, it, expect } from 'vitest';
import { LayeredConfig } from '../src';
import {type ArrayMergeStrategy} from "../src/types";

describe('Array merging strategies', () => {
    it('should override arrays by default', () => {
        const config = LayeredConfig.fromLayers([
            { name: 'base', config: { list: ['a', 'b'] } },
            { name: 'override', config: { list: ['c'] } }
        ]);
        expect(config.list).toEqual(['c']);
    });

    it('should concatenate arrays when strategy is "concat"', () => {
        const config = LayeredConfig.fromLayers([
            { name: 'base', config: { list: ['a', 'b'] } },
            { name: 'override', config: { list: ['c'] } }
        ], { arrayMergeStrategy: 'concat' });
        expect(config.list).toEqual(['a', 'b', 'c']);
    });

    it('should merge arrays as union when strategy is "union"', () => {
        const config = LayeredConfig.fromLayers([
            { name: 'base', config: { list: ['a', 'b'] } },
            { name: 'override', config: { list: ['b', 'c'] } }
        ], { arrayMergeStrategy: 'union' });
        expect(config.list).toEqual(['a', 'b', 'c']);
    });

    it('should support local override strategy', () => {
        const config = LayeredConfig.fromLayers<{
            list:string[],
            list_ArrayMergeStrategy: ArrayMergeStrategy
        }>([
            { name: 'base', config: { list: ['a', 'b'], list_ArrayMergeStrategy: 'concat' } },
            {
                name: 'override',
                config: {
                    list: ['c']
                }
            }
        ], {
            arrayMergeStrategy: 'override',
            arrayLocalMergeStrategyNameSuffix: '_ArrayMergeStrategy'
        });
        expect(config.list).toEqual(['a', 'b', 'c']);
    });

    it('should support local override strategy in the same layer as the array', () => {
        const config = LayeredConfig.fromLayers<{
            list:string[],
            list_merging_strategy: ArrayMergeStrategy
        }>([
            {
                name: 'base',
                config: {
                    list: ['a', 'b'],
                    list_merging_strategy: 'concat'
                }
            },
            {
                name: 'override',
                config: {
                    list: ['c']
                }
            }
        ], {
            arrayMergeStrategy: 'override',
            arrayLocalMergeStrategyNameSuffix: '_merging_strategy'
        });
        expect(config.list).toEqual(['a', 'b', 'c']);
    });

    it('should respect local "override" strategy even if global is "concat"', () => {
        const config = LayeredConfig.fromLayers<{
            list:string[],
            list_strategy: ArrayMergeStrategy
        }>([
            { name: 'base', config: { list: ['a', 'b'] } },
            {
                name: 'override',
                config: {
                    list: ['c'],
                    list_strategy: 'override'
                }
            }
        ], {
            arrayMergeStrategy: 'concat',
            arrayLocalMergeStrategyNameSuffix: '_strategy'
        });
        expect(config.list).toEqual(['c']);
    });

    it('should handle deep array merging with strategies', () => {
        const config = LayeredConfig.fromLayers<{nested: {list: string[]}}>([
            { name: 'base', config: { nested: { list: ['a'] } } },
            { name: 'override', config: { nested: { list: ['b'] } } }
        ], { arrayMergeStrategy: 'concat' });
        expect(config.nested.list).toEqual(['a', 'b']);
    });

    it('should handle local override merging hint even when in nested objects', () => {
        const config = LayeredConfig.fromLayers<{
            nested: {list: string[], list_strategy: ArrayMergeStrategy}
        }>([
            { name: 'base', config: { nested: { list: ['a'] } } },
            {
                name: 'override',
                config: {
                    nested: {
                        list: ['b'],
                        list_strategy: 'concat'
                    }
                }
            }
        ], {
            arrayMergeStrategy: 'override',
            arrayLocalMergeStrategyNameSuffix: '_strategy'
        });
        expect(config.nested.list).toEqual(['a', 'b']);
    });
});
