/**
 * batch.mjs — Headless batch runner for parameter sweeps and replicates.
 *
 *   npm run batch -- path/to/config.json
 *
 * Runs the same simulation pipeline as the SharedWorker (precomputed
 * trajectories + equations file), without a browser, for every combination of
 * the swept parameters and seeds, several runs in parallel (worker_threads).
 * See scripts/batch.example.json for the configuration format.
 *
 * Output: <outDir>/<run name>/frames/frame_<frame>.json (the cells of a frame,
 * in the format of the browser's saved states) and <outDir>/<run name>/run.json
 * (the run configuration: files, parameters, seed, frames, engine commit).
 */

import { Worker } from 'node:worker_threads';
import { readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { processFileData } from '../src/simulation/dataProcessor.js';
import { doublingTimeMinutes } from '../src/simulation/stateManager.js';
import { createSeededMath, evaluateEquations } from '../src/simulation/equations.js';
import { randomSeed } from '../src/simulation/equations.js';
import { packTrajectories, frameCount } from '../src/simulation/trajectories.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ──────────────────────────────────────────────────────────

const configPath = process.argv[2];
if (!configPath) {
    console.error('Usage: npm run batch -- path/to/config.json');
    process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const fromConfig = (p) => path.resolve(path.dirname(configPath), p);

const equationsPath = fromConfig(config.equations);
const dataPath = fromConfig(config.data);
const outDir = fromConfig(config.outDir ?? 'batch-output');
const saveEvery = config.saveEvery ?? 40;
const baseParams = config.params ?? {};
const sweep = config.sweep ?? {};
const seeds = Array.isArray(config.seeds)
    ? config.seeds
    : Array.from({ length: config.seeds ?? 1 }, randomSeed);
// Default: half the hardware threads, i.e. about one run per physical core. A run is
// CPU-bound and gains little from the second hardware thread of a core: on a
// 6-core/12-thread machine the total speed stops growing at about 6 parallel runs
// (same rule as the browser's soft limit in src/views/controller-view.js).
const maxParallel = config.maxParallel ?? Math.max(1, Math.floor(os.availableParallelism() / 2));

// ─── Runs: cartesian product of the swept parameters × seeds ────────────────

const combinations = Object.entries(sweep).reduce(
    (acc, [name, values]) => acc.flatMap((combo) => values.map((value) => ({ ...combo, [name]: value }))),
    [{}],
);
const runs = combinations.flatMap((combo) => seeds.map((seed) => ({
    name: [...Object.entries(combo).map(([k, v]) => `${k}=${v}`), `seed=${seed}`].join('_').replace(/[^\w.=-]/g, '-'),
    overrides: { ...baseParams, ...combo },
    seed,
})));

// ─── Data: parse once, share between threads ────────────────────────────────

console.log(`Reading ${dataPath} …`);
const processed = processFileData(readFileSync(dataPath, 'utf8'), path.basename(dataPath));
const startFrame = config.frames?.start ?? 1;   // the browser also starts at frame 1
const endFrame = Math.min(config.frames?.end ?? processed.bacteriaTimeSeries.length, processed.bacteriaTimeSeries.length);

// Frames are saved only from frame `saveFrom` on: the frames before are simulated
// (the system needs them to reach steady state) but not saved. Default: save all.
const saveFrom = config.saveFrom ?? startFrame;
if (!Number.isInteger(saveFrom) || saveFrom < startFrame || saveFrom >= endFrame) {
    console.error(`"saveFrom" must be a frame number between ${startFrame} and ${endFrame - 1} `
        + `(the simulated frames), got ${JSON.stringify(config.saveFrom)}.`);
    process.exit(1);
}

// Frames [startFrame, endFrame) packed into typed arrays backed by SharedArrayBuffers,
// so that all threads read the same single copy
const shared = (Type, length) => new Type(new SharedArrayBuffer(length * Type.BYTES_PER_ELEMENT));
const trajectories = packTrajectories(processed, { start: startFrame, end: endFrame, allocate: shared });
const framesToRun = frameCount(trajectories);

const engineCommit = (() => {
    try {
        const commit = execSync('git rev-parse HEAD', { cwd: here }).toString().trim();
        const dirty = execSync('git status --porcelain -- .', { cwd: path.join(here, '..') }).toString().trim() !== '';
        return dirty ? `${commit} (with uncommitted changes)` : commit;
    } catch {
        return 'unknown';
    }
})();

const equationsText = readFileSync(equationsPath, 'utf8');
mkdirSync(outDir, { recursive: true });

// Frame duration: the doubling time ln 2 / alpha spread over the average cell
// lifetime in frames. Each run recomputes it from its own parameters (batch-worker.mjs),
// so a sweep of alpha changes it; this is the value for the base parameters.
const minutesPerStep = doublingTimeMinutes({ ...evaluateEquations(equationsText, createSeededMath(1).math).params, ...baseParams })
    / processed.averageLifetime;

console.log(`${runs.length} run(s) × ${framesToRun} frames (${(minutesPerStep * 60).toFixed(1)} s per frame), `
    + `${Math.min(maxParallel, runs.length)} in parallel → ${outDir}`
    + (saveFrom > startFrame ? `; saving from frame ${saveFrom}` : ''));

// ─── Worker pool ────────────────────────────────────────────────────────────

const runOne = (run) => new Promise((resolve) => {
    const worker = new Worker(path.join(here, 'batch-worker.mjs'), {
        workerData: {
            run,
            equationsText,
            trajectories,
            startFrame,
            averageLifetime: processed.averageLifetime,
            saveEvery,
            saveFrom,
            runDir: path.join(outDir, run.name),
            metadata: {
                equations: equationsPath,
                data: dataPath,
                frames: { start: startFrame, end: endFrame },
                saveEvery,
                saveFrom,
                averageLifetime: processed.averageLifetime,
                engineCommit,
            },
        },
    });
    worker.on('message', (msg) => {
        if (msg.type === 'progress') console.log(`  ${run.name}: frame ${msg.frame} (${msg.done}/${framesToRun})`);
        if (msg.type === 'done') console.log(`✓ ${run.name} (${msg.seconds.toFixed(0)} s)`);
    });
    worker.on('error', (err) => { console.error(`✗ ${run.name}: ${err.stack ?? err}`); resolve(false); });
    worker.on('exit', (code) => resolve(code === 0));
});

const queue = [...runs];
let failed = 0;
await Promise.all(Array.from({ length: Math.min(maxParallel, runs.length) }, async () => {
    while (queue.length) {
        if (!(await runOne(queue.shift()))) failed++;
    }
}));
console.log(failed ? `${failed} run(s) failed.` : 'All runs finished.');
process.exit(failed ? 1 : 0);
