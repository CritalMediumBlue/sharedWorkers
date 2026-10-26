/**
 * batch-worker.mjs — One run of the batch runner (worker_threads entry point).
 *
 * Mirrors the SharedWorker's init() + singleStep() loop: load the equations with
 * a seeded Math, apply the parameter overrides, reseed, initialise on the first
 * frame, then advance one frame per step and save every `saveEvery` frames.
 */

import { workerData, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createBacteriumSystem, updateSimulation } from '../src/simulation/simulationManager.js';
import { createSeededMath, evaluateEquations } from '../src/simulation/equations.js';
import { CONFIG } from '../src/config.js';
import { frameCells, frameCount as countFrames } from '../src/simulation/trajectories.js';

const { run, equationsText, trajectories, startFrame, minutesPerStep, saveEvery, saveFrom, runDir, metadata } = workerData;
const frameCount = countFrames(trajectories);

/** The cells of frame f (relative to startFrame), in the format of dataProcessor.js. */
const frame = (f) => frameCells(trajectories, f);

const seeded = createSeededMath(run.seed);
const { vars, params } = evaluateEquations(equationsText, seeded.math);
// Engine settings with defaults in the engine, valid even when the equations file
// does not define them
const ENGINE_PARAMS = ['DIFFUSION_STEADY_TOLERANCE'];
const unknown = Object.keys(run.overrides).filter((name) => !(name in params) && !ENGINE_PARAMS.includes(name));
if (unknown.length) throw new Error(`Unknown parameter(s) in the run configuration: ${unknown.join(', ')}`);
Object.assign(params, run.overrides);
if (!Number.isFinite(params.TIME_SCALE_SECONDS)) {
    throw new Error('The equations file must define params.TIME_SCALE_SECONDS (seconds per time unit of the equations).');
}

// frames in their own folder, so that tools reading every *.json of a folder
// (e.g. the thesis' scripts/heatmap.py) do not pick up run.json
const framesDir = path.join(runDir, 'frames');
mkdirSync(framesDir, { recursive: true });
const startedAt = new Date();
const writeRunInfo = (extra) => writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    name: run.name, seed: run.seed, overrides: run.overrides, params, ...metadata,
    startedAt: startedAt.toISOString(), ...extra,
}, null, 2));
writeRunInfo({ status: 'running' });

seeded.reseed(run.seed);
createBacteriumSystem(CONFIG, vars, params, frame(0), trajectories.lineage);

const pad = (n) => String(n).padStart(6, '0');
for (let f = 0; f < frameCount; f++) {
    const { bacteriaDataUpdated } = updateSimulation(frame(f), minutesPerStep, params);
    const done = f + 1;
    const frameNumber = startFrame + f;
    // Frames before saveFrom (the transient) are simulated but not saved
    if (frameNumber >= saveFrom && (done % saveEvery === 0 || done === frameCount)) {
        writeFileSync(path.join(framesDir, `frame_${pad(frameNumber)}.json`), JSON.stringify(bacteriaDataUpdated));
        parentPort.postMessage({ type: 'progress', frame: frameNumber, done });
    }
}

const seconds = (Date.now() - startedAt.getTime()) / 1000;
writeRunInfo({ status: 'finished', finishedAt: new Date().toISOString(), durationSeconds: seconds });
parentPort.postMessage({ type: 'done', seconds });
