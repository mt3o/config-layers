# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below `1.0.0`, a
minor bump is where breaking changes land.

## [0.4.0] — 2026-09-08

A correctness and hardening release. Several behaviours changed, most of them because they were
wrong; read **Breaking changes** before upgrading.

### Security

- **Fixed prototype pollution.** A layer could write to `Object.prototype` through a `__proto__` or
  `constructor.prototype` key — reachable in practice, since a layer parsed from JSON carries
  `__proto__` as a real own property that `hasOwnProperty` does not filter out. Merging now skips
  `__proto__`, `constructor` and `prototype`.

### Breaking changes

- **A missing key no longer throws.** The default `notFoundHandler` now logs a warning and resolves
  the key to `undefined`. To restore the old behaviour, pass your own handler:

  ```ts
  LayeredConfig.fromLayers(layers, {
    notFoundHandler: key => { throw new Error(`Key not found: ${String(key)}`); }
  });
  ```

  Each key is warned about once per config, so a miss inside a loop does not flood the console.

- **Dotted access now agrees with property access.** `cfg['a.b']` and `cfg.a.b` were separate code
  paths that disagreed. Dotted access previously resolved layers in the wrong order (a *lower*
  priority layer won), merged only one level deep, and turned arrays into objects
  (`{"0":"a","1":"b"}`), which also made array merge strategies invisible to it. Both forms now go
  through one resolver and return the same value.

- **Key paths address data only.** Path segments are matched as own properties, so
  `cfg['constructor.name']`, `cfg['__proto__.x']` and similar no longer resolve to anything.

- **The config takes its own copy of everything it exposes.** Layers, arrays, `Date`, `RegExp`,
  `Map`, `Set`, typed arrays and class instances are all deep-copied at construction. Consequences:

  - Mutating a layer object after `fromLayers` no longer changes what the config resolves.
    (`__inspect` and `getAll` still read the layers, since reporting provenance is their job.)
  - `freeze: true` no longer freezes arrays or objects you still hold a reference to.
  - Values you pass in are no longer the same objects the config hands back.

  Two things cannot be copied and are shared as before: **functions** (a closure cannot be cloned)
  and **private class fields** (`#x` is unreachable from outside the class, so a method depending on
  one will throw on the copy — keep such objects out of config layers).

- **Protocol lookups resolve to `undefined` instead of throwing.** Unknown symbols, `toJSON`,
  `toString`, `valueOf`, and `$$`/`@@`-prefixed library sentinels are answered without consulting
  `notFoundHandler`. A layer that genuinely defines one of those names still wins.

- **The UMD global is now `ConfigLayers`**, was `Config Layers` — which forced
  `window["Config Layers"]`.

- **`types` in `package.json` points at `./dist/index.d.ts`**, was `./dist/types.d.ts`, which never
  declared `LayeredConfig`. Only affected consumers on legacy `moduleResolution: node`.

- **`dist/` is no longer committed to the repository.** A `prepare` script builds it, so installing
  from npm or directly from git both still work. Only affects tooling that read the built files out
  of a checkout.

- **Declaration maps are no longer published.** They pointed at `src/` files that were never in the
  tarball.

### Added

- `toJSON()` on the config handle, so `JSON.stringify(config)` returns the resolved configuration.
- `sideEffects: false`, letting bundlers drop the library entirely when an import goes unused —
  measured at 25 bytes retained instead of 6.7 kB.
- A license banner in every bundle.
- An explicit browser-support statement in the README, and a `browserslist` entry.

### Fixed

- **The library crashed on iOS 15 / Safari 15** (an iPhone 6s or iPad Air 2). Key splitting used a
  regex lookbehind, which Safari only supports from 16.4; below that the bundler silently rewrites
  the literal to `new RegExp("…")`, which parses and then throws on the *first key lookup*. The
  splitter is now hand-written and the shipped bundle contains no regular expressions at all.
- Merging destroyed values it could not merge key by key: a `Date` became `{}`, a `Buffer` became
  `{"0":104,…}`, and class instances lost their prototype and methods.
- Merging threw `TypeError: Cannot create property 'b' on string` when one layer overrode a scalar
  with an object.
- A `Buffer` or typed array in a layer crashed construction, and a `/g` regex in a layer became
  unusable, once values were frozen.
- `__derive` silently dropped symbol-named layers, which `LayerName` explicitly permits.
- `__derive` reordered numeric-looking layer names (`'2024'`, `'8080'`) to the front, inverting
  their precedence.
- `String(config)`, template interpolation and `JSON.stringify(config)` threw.
- `config.name` and `config.length` threw. The handle is callable, so anything doing function-shaped
  introspection reads those.
- `Object.getOwnPropertyDescriptor` returned a descriptor with no `value`, so anything reading
  through descriptors rather than property access saw `undefined` for every key.
- An empty array or object at a dotted path read as missing.

### Performance

Measured against 0.2.1, both versions in the same process (median of seven runs):

| operation                | 0.2.1  | 0.3.0  |            |
|--------------------------|--------|--------|------------|
| `config.flat`            | 164 ns |  49 ns | 3.4× faster |
| `config['a.b.c.d']`      | 1174 ns | 154 ns | 7.6× faster |
| `config('a.b.c.d')`      | 1144 ns | 129 ns | 8.9× faster |
| `Object.keys(config)`    | 2341 ns | 1502 ns | 1.6× faster |
| `fromLayers(...)`        | 3120 ns | 6392 ns | **2× slower** |

Reads got faster because a key is no longer parsed on every property access. Construction got
slower because layers are now deep-copied so the config owns what it exposes — a few microseconds,
paid once at startup. That is a deliberate trade for the correctness guarantees above, not a
regression, and the read paths are guarded against regressing again by `tests/performance.test.ts`.

### Packaging and internals

- Minified builds: CJS 13.0 kB → 7.3 kB, UMD 14.2 kB → 7.5 kB. The ESM bundle is deliberately left
  unminified by the build tool, since downstream bundlers minify anyway.
- The in-source test suite is no longer shipped in the published bundle.
- The build target is pinned explicitly (`es2020`, `safari15`, `chrome87`, `firefox78`, `edge88`)
  rather than inherited from the bundler's shifting default.
- Test suite grew from 78 tests (2 of them failing) to 290, across 18 files, with coverage reporting
  and thresholds.
- Added ESLint, CI on every push and pull request across Node 20/22/24, and a release workflow that
  publishes the version named by the git tag rather than an unrelated patch bump.

## [0.3.0]

Released to npm from a separate line of work that is not part of this history, and not documented
here. `0.2.1` upgraders should go straight to `0.4.0`.

## [0.2.1] and earlier

No changelog was kept before this release. See the
[commit history](https://github.com/mt3o/config-layers/commits/main) and the
[releases page](https://github.com/mt3o/config-layers/releases).

[0.4.0]: https://github.com/mt3o/config-layers/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mt3o/config-layers/releases/tag/v0.3.0
[0.2.1]: https://github.com/mt3o/config-layers/releases/tag/v0.2.1
