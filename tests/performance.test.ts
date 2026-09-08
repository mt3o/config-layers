import {beforeAll, describe, expect, it} from 'vitest';
import {LayeredConfig} from '../src';

/**
 * Performance guards.
 *
 * These exist because the library's hot path has regressed silently before: key splitting used to
 * run two regexes on *every* property access, which made a dotted read roughly 250x a plain object
 * read. Nothing caught it, and nothing would catch it coming back.
 *
 * ## Why ratios rather than nanoseconds
 *
 * An absolute threshold ("a dotted read must take under 200ns") is unusable in CI: shared runners
 * vary by several times between runs, so the number is either so loose it catches nothing or so
 * tight it fails constantly. Every measurement here is instead expressed as a multiple of a
 * baseline operation measured in the same process, moments apart, so machine speed cancels out.
 *
 * ## How the thresholds were chosen
 *
 * By measuring both the current implementation and the pre-fix one in a single process, so each
 * limit sits in a real gap rather than at a guessed number:
 *
 * | operation             | now   | before the fix | limit |
 * |-----------------------|-------|----------------|-------|
 * | flat read             |  15x  |           53x  |  30x  |
 * | dotted read           |  44x  |          364x  | 120x  |
 * | call form             |  39x  |          362x  | 110x  |
 * | `in`                  |  14x  |           51x  |  30x  |
 *
 * Every limit is at least 2x above what the code does today and comfortably below what the
 * regression measured, so noise does not trip them but a reintroduced per-access regex does.
 *
 * ## What these do *not* catch
 *
 * Order-of-magnitude regressions only - which is the class that has actually happened here. A 2x
 * drift sits below the noise floor of a shared CI runner, and a limit tight enough to catch it
 * would fail on a busy machine instead.
 *
 * A worked example: deleting the key-path cache takes a dotted read from ~43x to ~86x. That is a
 * real 2x regression and these guards let it through, deliberately. The cache is worth keeping -
 * that measurement is the evidence - but it is not something a timing assertion can police
 * reliably.
 *
 * If one of these fails, run it locally before assuming the machine was busy: the printed ratio
 * says how far off it is, and a genuine regression is usually several times over the limit rather
 * than just past it.
 */

/** Kept live so the engine cannot optimise the measured work away entirely. */
const sink = {v: 0};

/** Nanoseconds per iteration for a single sample. */
function sample(fn: () => void, iterations: number): number {
    const started = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    return Number(process.hrtime.bigint() - started) / iterations;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Median of `rounds` measurements of `op` divided by a baseline measured in the same round.
 * Interleaving the two is what makes this survive a runner whose speed drifts mid-test.
 */
function ratioTo(baseline: () => void, op: () => void, iterations: number, rounds = 5): number {
    sample(baseline, Math.min(iterations, 20_000));
    sample(op, Math.min(iterations, 20_000));

    const ratios: number[] = [];
    for (let r = 0; r < rounds; r++) {
        const base = sample(baseline, iterations);
        ratios.push(sample(op, iterations) / base);
    }
    return median(ratios);
}

describe('performance guards', () => {

    const plain: any = {a: {b: {c: {d: 'value'}}}};
    const cfg: any = LayeredConfig.fromLayers<any>([
        {name: 'low', config: {a: {b: {c: {d: 'value'}}}, flat: 'v', other: 1}},
        {name: 'high', config: {a: {b: {c: {e: 'x'}}}}},
    ]);

    /** A plain nested property read: the cheapest thing the config could possibly reduce to. */
    const baseline = () => { sink.v += plain.a.b.c.d.length; };

    const measured: Record<string, number> = {};

    beforeAll(() => {
        const ITER = 60_000;
        measured.flat = ratioTo(baseline, () => { sink.v += cfg.flat.length; }, ITER);
        measured.dotted = ratioTo(baseline, () => { sink.v += cfg['a.b.c.d'].length; }, ITER);
        measured.call = ratioTo(baseline, () => { sink.v += cfg('a.b.c.d').length; }, ITER);
        measured.has = ratioTo(baseline, () => { sink.v += ('flat' in cfg) ? 1 : 0; }, ITER);
    });

    const within = (name: string, limit: number, note: string) => {
        const got = measured[name];
        expect(
            got,
            `${name} measured ${got.toFixed(1)}x a plain nested property read, limit ${limit}x. ${note}`,
        ).toBeLessThan(limit);
    };

    it('a flat read stays close to a plain property read', () => {
        within('flat', 30, 'Something was added to the per-access path.');
    });

    it('a dotted read does not regain per-access key parsing', () => {
        // This is the one that actually regressed: the old splitter measured 364x here.
        within('dotted', 120, 'Key splitting is probably no longer cached, or is using a regex again.');
    });

    it('the call form tracks the dotted read', () => {
        within('call', 110, 'cfg("a.b.c") should cost about what cfg["a.b.c"] costs.');
    });

    it('`in` stays cheap', () => {
        within('has', 30, 'The has trap should resolve no more than a read does.');
    });

});

describe('construction cost', () => {
    // Construction deep-copies every layer so the config owns what it exposes, which is not free.
    // Anchored to a JSON round-trip of the same data - currently about 0.58x, i.e. merging three
    // layers costs less than parsing the equivalent config once. The limit catches something
    // going badly wrong, such as copying once per layer instead of once at the end.
    const layer = (seed: number) => ({
        apiUrl: `https://api${seed}.example.com`, timeout: 5000, retries: 3, debug: false,
        features: {flags: ['a', 'b', 'c', 'd', 'e'], beta: true},
        db: {host: 'h', port: 5432, pool: {min: 1, max: 10}, replicas: ['r1', 'r2', 'r3']},
        auth: {providers: ['google', 'github'], session: {ttl: 3600}},
        i18n: {locales: ['en', 'de', 'fr', 'es', 'it'], fallback: 'en'},
    });

    it('merging three layers stays under a JSON round-trip of the same data', () => {
        const layers = [0, 1, 2].map((i) => ({name: `L${i}`, config: layer(i)}));
        const json = JSON.stringify(layers.map((l) => l.config));

        const got = ratioTo(
            () => { sink.v += JSON.parse(json).length; },
            () => { sink.v += LayeredConfig.fromLayers<any>(layers as any) ? 1 : 0; },
            1_000,
        );

        expect(got, `fromLayers measured ${got.toFixed(2)}x a JSON round-trip, limit 2x`).toBeLessThan(2);
    });
});
