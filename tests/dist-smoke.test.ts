import {createRequire} from 'node:module';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

/**
 * Checks the packaged build rather than the sources.
 *
 * The rest of the suite resolves `config-layers` to `src/` (see the alias in vitest.config.ts) so
 * that it runs on a plain checkout with no build step. That leaves the published artifact itself
 * unverified, which is what this file covers: the exports map, all three module formats, and the
 * syntax floor.
 *
 * Skips itself when `dist/` is absent, so `pnpm test` stays green before a build. CI runs
 * `pnpm build` first, so these do run there.
 */
const dist = (file: string) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));
const built = existsSync(dist('config-layers.js'));

describe.skipIf(!built)('packaged build', () => {

    it('the ESM bundle exports a working LayeredConfig', async () => {
        const {LayeredConfig} = await import(dist('config-layers.js'));
        const cfg = LayeredConfig.fromLayers([
            {name: 'base', config: {db: {host: 'low', port: 1}}},
            {name: 'env', config: {db: {host: 'high'}}},
        ]);
        expect(cfg['db.host']).toBe('high');
        expect(cfg.db).toEqual({host: 'high', port: 1});
    });

    it('the CJS bundle is requireable and works', () => {
        const require = createRequire(import.meta.url);
        const {LayeredConfig} = require(dist('config-layers.cjs'));
        const cfg = LayeredConfig.fromLayers([{name: 'a', config: {x: 1}}]);
        expect(cfg.x).toBe(1);
    });

    it('the UMD bundle is requireable and works', () => {
        const require = createRequire(import.meta.url);
        const {LayeredConfig} = require(dist('config-layers.umd.cjs'));
        const cfg = LayeredConfig.fromLayers([{name: 'a', config: {x: 1}}]);
        expect(cfg.x).toBe(1);
    });

    it('ships the type declarations the exports map points at', () => {
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'));
        const types = pkg.exports['.'].types.replace(/^\.\//, '');
        expect(existsSync(fileURLToPath(new URL(`../${types}`, import.meta.url)))).toBe(true);
        // the declaration the map points at must actually declare the class
        expect(readFileSync(fileURLToPath(new URL(`../${types}`, import.meta.url)), 'utf-8'))
            .toMatch(/declare class LayeredConfig/);
    });

    it('every file named by the exports map exists', () => {
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'));
        for (const [condition, target] of Object.entries(pkg.exports['.'] as Record<string, string>)) {
            const path = fileURLToPath(new URL(`../${target.replace(/^\.\//, '')}`, import.meta.url));
            expect(existsSync(path), `exports["."].${condition} -> ${target}`).toBe(true);
        }
    });

    describe('syntax floor (iPhone 6s / iOS 15)', () => {
        // Regex lookbehind only reached Safari 16.4. Below that, esbuild silently rewrites an
        // unsupported literal to `new RegExp("...")` - no warning, no build error - and it throws
        // at runtime on the first key lookup. So build.target does NOT guard this; the built
        // output has to be inspected.
        const bundles = ['config-layers.js', 'config-layers.cjs', 'config-layers.umd.cjs'];

        it.each(bundles)('%s contains no lookbehind assertion', (file) => {
            expect(readFileSync(dist(file), 'utf-8')).not.toMatch(/\(\?<[!=]/);
        });

        it.each(bundles)('%s contains no runtime-constructed RegExp', (file) => {
            // esbuild emits `new RegExp(...)` exactly when it had to downgrade a literal it
            // considered unsupported at the configured target.
            expect(readFileSync(dist(file), 'utf-8')).not.toMatch(/new RegExp\(/);
        });
    });
});
