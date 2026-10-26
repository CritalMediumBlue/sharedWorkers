/**
 * equations.js — Loading equations files with a seeded random number generator.
 *
 * Equations files assign `window.vars` and `window.params` and may call
 * `Math.random()` (e.g. to draw the initial producer/receiver flag). They are
 * evaluated with a `Math` object whose `random` is seeded, so that a simulation
 * is reproducible from its seed without editing any equations file.
 *
 * Shared by the SharedWorker (simulation-worker.js) and the headless batch
 * runner (scripts/batch.mjs).
 */

/** mulberry32: a small, fast 32-bit seeded PRNG returning numbers in [0, 1). */
const mulberry32 = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/** A random 32-bit seed, for new simulations and replicates. */
export const randomSeed = () => Math.floor(Math.random() * 4294967296);

/**
 * Create a `Math` replacement whose `random()` is seeded.
 *
 * The same object is handed to the equations file once, when it is evaluated;
 * `reseed(seed)` restarts its sequence, so re-initialising a simulation with
 * the same seed reproduces the same random draws.
 *
 * @param {number} seed
 * @returns {{ math: object, reseed: (seed: number) => void }}
 */
export function createSeededMath(seed = randomSeed()) {
    let random = mulberry32(seed);
    const math = Object.create(null);
    for (const name of Object.getOwnPropertyNames(Math)) math[name] = Math[name];
    math.random = () => random();
    return {
        math,
        reseed: (newSeed) => { random = mulberry32(newSeed); },
    };
}

/**
 * Evaluate the text of an equations file.
 *
 * @param {string} text - Source of the equations file (assigns window.vars and window.params).
 * @param {object} math - The (seeded) Math object visible to the file as `Math`.
 * @returns {{ vars: object, params: object }}
 */
export function evaluateEquations(text, math) {
    const _window = {};
    new Function('window', 'Math', text)(_window, math);
    if (!_window.vars || !_window.params) {
        throw new Error('The equations file must define window.vars and window.params.');
    }
    return { vars: _window.vars, params: _window.params };
}
