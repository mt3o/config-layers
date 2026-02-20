import { describe, it, expect, vi } from 'vitest';
import { LayeredConfig } from '../src/index';

describe('Config options acceptNull and acceptUndefined', () => {
    interface Schema {
        foo?: string | null;
        bar?: {
            baz?: string | null;
        };
    }

    it('__inspect respects acceptNull', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { foo: 'base' } },
            { name: 'override', config: { foo: null } }
        ], { acceptNull: true });

        const inspection = config.__inspect('foo');
        expect(inspection.resolved.value).toBe(null);
        expect(inspection.resolved.source).toBe('override');
        expect(inspection.layers.find(l => l.layer === 'override')?.isPresent).toBe(true);
        expect(inspection.layers.find(l => l.layer === 'override')?.isActive).toBe(true);
    });

    it('__inspect respects acceptUndefined', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { foo: 'base' } },
            { name: 'override', config: { foo: undefined } }
        ], { acceptUndefined: true });

        const inspection = config.__inspect('foo');
        expect(inspection.resolved.value).toBe(undefined);
        expect(inspection.resolved.source).toBe('override');
        expect(inspection.layers.find(l => l.layer === 'override')?.isPresent).toBe(true);
        expect(inspection.layers.find(l => l.layer === 'override')?.isActive).toBe(true);
    });

    it('getAll respects acceptNull', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { foo: 'base' } },
            { name: 'override', config: { foo: null } }
        ], { acceptNull: true });

        const all = config.getAll('foo');
        expect(all).toHaveLength(2);
        expect(all[0]).toEqual({ layer: 'override', value: null });
    });

    it('getAll ignores null by default', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { foo: 'base' } },
            { name: 'override', config: { foo: null } }
        ]);

        const all = config.getAll('foo');
        expect(all).toHaveLength(1);
        expect(all[0]).toEqual({ layer: 'base', value: 'base' });
    });

    it('deep objects respect acceptNull in flattening', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { bar: { baz: 'base' } } },
            { name: 'override', config: { bar: { baz: null } } }
        ], { acceptNull: true });

        expect(config.bar?.baz).toBe(null);
    });

    it('deep objects ignore null in flattening by default', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { bar: { baz: 'base' } } },
            { name: 'override', config: { bar: { baz: null } } }
        ]);

        expect(config.bar?.baz).toBe('base');
    });

    it('__derive preserves options', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { foo: 'base' } }
        ], { acceptNull: true });

        const derived = config.__derive('override', { foo: null });
        expect(derived.foo).toBe(null);
    });

    it('__derive can change options', () => {
        const config = LayeredConfig.fromLayers<Schema>([
            { name: 'base', config: { foo: 'base' } }
        ], { acceptNull: false });

        const derived = config.__derive({ acceptNull: true }).__derive('override', { foo: null });
        expect(derived.foo).toBe(null);
    });
});
