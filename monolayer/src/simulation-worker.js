/**
 * simulation-worker.js — SharedWorker
 * 
 * Owns the entire simulation lifecycle: state, stepping, statistics.
 * Publishes state to dashboard windows on topic-based subscriptions.
 * Receives commands from the controller window.
 */

import { createBacteriumSystem, updateSimulation, setParamFromGUI, getGlobalSpeciesConcentrations } from './simulation/simulationManager.js';
import { createStates, createHistories, createConstants, updateHistories, getHistories, resetHistories } from './simulation/stateManager.js';
import { frameCells, frameCount } from './simulation/trajectories.js';
import { createSeededMath, evaluateEquations, randomSeed } from './simulation/equations.js';
import * as physicsManager from './simulation/physics/physicsManager.js';
import { CONFIG } from './config.js';

// ─── Connection management ──────────────────────────────────────────────────
const portSubscriptions = new Map(); // port → Set<topic>

function publish(topic, payload) {
    for (const [port, topics] of portSubscriptions) {
        if (topics.has(topic)) {
            try {
                port.postMessage({ type: topic, data: payload });
            } catch {
                portSubscriptions.delete(port);
            }
        }
    }
}

// ─── Simulation state ───────────────────────────────────────────────────────
let session = null;
let constants = null;
let trajectories = null;   // packed frames (trajectories.js), sent by the controller page
let histories = null;
let bacteriaDataUpdated = null;
let concentrations = null;
let previusVars = null;
let previusParams = null;
let storedProcessedData = null;
let selectedSpecies = null;
let coloringRule = {};
let intervalId = null;
let stepCount = 0;
let savingState = true;
let freq = 40; // Save every N steps when savingState is true
let physicsMode = false;

// Seeded Math for the equations file: every init/reset restarts the random
// sequence from `seed`, so a simulation is reproducible from its seed.
let seed = randomSeed();
const seededMath = createSeededMath(seed);

// Hardcoded single-capsule defaults for the physics path
const PHYSICS_CAPSULE_CONFIG = {
    id: 'b0',
    x: 0,
    y: 0,
    angle: 0,
    halfLength: 1.5,
    radius: 0.5,
};
const PHYSICS_DT = 0.01;           // seconds per Rapier sub-step
const PHYSICS_MAX_STEPS = 10000;   // finite upper bound so the loop always ends

const TICK_MS = 16; // ≈60 Hz, similar to requestAnimationFrame

// Default colours for species (visible defaults so bacteria aren't invisible)
const defaultColors = [
    { r: 0, g: 0,  b: 0,  a: 1, intensity: 1 }
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip function references from vars so the object is postMessage-safe */
function serializeVars(vars) {
    const result = { int: {}, ext: {} };
    for (const name of Object.keys(vars.int)) result.int[name] = { name };
    for (const name of Object.keys(vars.ext)) result.ext[name] = { name };
    return result;
}

/** Build the payload used by state:init (also resent to late-joining ports) */
function buildInitPayload() {
    return {
        config: CONFIG,
        speciesNames: Object.keys(previusVars.int),
        extSpeciesNames: Object.keys(previusVars.ext),
        coloringRule: { ...coloringRule },
    };
}



// ─── Simulation lifecycle ───────────────────────────────────────────────────

function init(packedTrajectories) {
    stopLoop();

    trajectories = packedTrajectories;
    ({ session } = createStates());
    seededMath.reseed(seed);

    createBacteriumSystem(
        CONFIG, previusVars, previusParams,
        frameCells(trajectories, session.currentTimeStep),
        trajectories.lineage,
    );

    constants = createConstants();
    createHistories(Object.keys(previusVars.int).length);
    constants.numberOfTimeSteps = frameCount(trajectories);
    constants.fromStepToMinutes = constants.doublingTime / trajectories.averageLifetime;
    Object.freeze(constants);

    resetHistories();
    stepCount = 0;

    publish('state:init', buildInitPayload());

    session.play = true;
    startLoop();
}

async function initPhysics() {
    stopLoop();

    await physicsManager.init(PHYSICS_CAPSULE_CONFIG);

    const seedBacteria = physicsManager.getBacteriaSnapshot();
    const lineageMap = { [PHYSICS_CAPSULE_CONFIG.id]: 0 };

    ({ session } = createStates());
    seededMath.reseed(seed);

    createBacteriumSystem(CONFIG, previusVars, previusParams, seedBacteria, lineageMap);

    constants = createConstants();
    createHistories(Object.keys(previusVars.int).length);
    constants.numberOfTimeSteps = PHYSICS_MAX_STEPS;
    constants.fromStepToMinutes = 0.1;
    Object.freeze(constants);

    resetHistories();
    stepCount = 0;

    publish('state:init', buildInitPayload());

    session.play = true;
    startLoop();
}

function singleStep() {
    if (!session) return;
    if (session.currentTimeStep >= constants.numberOfTimeSteps) return;

    let currentBacteria;
    if (physicsMode) {
        physicsManager.step(PHYSICS_DT);
        currentBacteria = physicsManager.getBacteriaSnapshot();
    } else {
        if (!trajectories) return;
        currentBacteria = frameCells(trajectories, session.currentTimeStep);
    }

    ({ bacteriaDataUpdated, concentrations } =
        updateSimulation(currentBacteria, constants.fromStepToMinutes, previusParams));

    const globalParams = getGlobalSpeciesConcentrations(bacteriaDataUpdated);
    updateHistories(globalParams.mean);
    histories = getHistories();
    session.currentTimeStep++;
    stepCount++;


    if (savingState && stepCount % freq === 0) {
        console.log(`Saving state at step ${session.currentTimeStep} / ${constants.numberOfTimeSteps}`);
        savestate();
    }



}

function savestate() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        publish('state:save', {
            filename: `bacteria_state_${timestamp}.json`,
            data: bacteriaDataUpdated,
        });
    }

function publishAllState() {
    publish('state:bacteria', bacteriaDataUpdated);

    if (selectedSpecies && concentrations?.[selectedSpecies]) {
        publish('state:concentrations', {
            species: selectedSpecies,
            conc: concentrations[selectedSpecies].conc.slice(),   // typed-array copy: cheap to post
        });
    }

    publish('state:overlay', {
        currentTimeStep: session.currentTimeStep,
        numberOfTimeSteps: constants.numberOfTimeSteps,
        fromStepToMinutes: constants.fromStepToMinutes,
    });

    publish('state:histories', histories);
}

function tick() {
    if (!session || !session.play) return;

    singleStep();

    // Publish at different cadences (matching original render logic)
    if (stepCount % 2 === 0) {
        publish('state:bacteria', bacteriaDataUpdated);

        if (selectedSpecies && concentrations?.[selectedSpecies]) {
            publish('state:concentrations', {
                species: selectedSpecies,
                conc: concentrations[selectedSpecies].conc.slice(),   // typed-array copy: cheap to post
            });
        }

        publish('state:overlay', {
            currentTimeStep: session.currentTimeStep,
            numberOfTimeSteps: constants.numberOfTimeSteps,
            fromStepToMinutes: constants.fromStepToMinutes,
        });
    }

    if (stepCount % 2 === 0) {
        publish('state:histories', histories);
    }

    // Finished?
    if (session.currentTimeStep >= constants.numberOfTimeSteps) {
        publish('state:finished', {});
        session.play = false;
        stopLoop();
    }
}

function startLoop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(tick, TICK_MS);
}

function stopLoop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

// ─── Port connection handler ────────────────────────────────────────────────

self.onconnect = (e) => {
    const port = e.ports[0];
    const topics = new Set();
    portSubscriptions.set(port, topics);

    port.onmessage = (event) => {
        const { type, data } = event.data;

        switch (type) {

            // ── Subscription management ──
            case 'subscribe':
                (data.topics || []).forEach(t => topics.add(t));
                // Late-joining window: resend current init state if available
                if (topics.has('state:init') && session && previusVars) {
                    port.postMessage({ type: 'state:init', data: buildInitPayload() });
                }
                break;

            case 'unsubscribe':
                (data.topics || []).forEach(t => topics.delete(t));
                break;

            // ── Identity: is this worker still unused? ──
            case 'command:hello':
                port.postMessage({
                    type: 'state:hello',
                    data: { fresh: previusVars === null && session === null, seed },
                });
                break;

            case 'command:disconnect':
                portSubscriptions.delete(port);
                break;

            // ── File loading ──
            case 'command:loadEquations': {
                try {
                    ({ vars: previusVars, params: previusParams } = evaluateEquations(data.text, seededMath.math));
                } catch (err) {
                    port.postMessage({ type: 'error', data: { message: `Equations eval failed: ${err.message}` } });
                    break;
                }

                // Assign default visible colours
                Object.keys(previusVars.int).forEach((name, i) => {
                    coloringRule[name] = { ...defaultColors[i % defaultColors.length] };
                });

                port.postMessage({
                    type: 'equations:loaded',
                    data: {
                        vars: serializeVars(previusVars),
                        params: { ...previusParams },
                        intSpeciesNames: Object.keys(previusVars.int),
                        extSpeciesNames: Object.keys(previusVars.ext),
                        fileTitle: data.filename || 'Unknown Equations',
                    },
                });
                break;
            }

            // Trajectories parsed and packed once by the controller page (trajectories.js),
            // so that every simulation holds only the compact typed arrays
            case 'command:loadTrajectories': {
                storedProcessedData = data.trajectories;
                port.postMessage({
                    type: 'data:loaded',
                    data: { timeSteps: frameCount(storedProcessedData), fileTitle: storedProcessedData.fileTitle },
                });
                break;
            }

            // ── Simulation commands ──
            case 'command:setSeed':
                seed = data.seed >>> 0;
                break;

            case 'command:setPhysicsMode':
                physicsMode = !!data.enabled;
                break;

            case 'command:init':
                if (physicsMode && previusVars && previusParams) {
                    initPhysics();
                } else if (storedProcessedData && previusVars && previusParams) {
                    init(storedProcessedData);
                }
                break;

            case 'command:start':
                if (session) { session.play = true; if (!intervalId) startLoop(); }
                break;

            case 'command:pause':
                if (session) session.play = false;
                break;

            case 'command:toggle':
                if (session) {
                    session.play = !session.play;
                    if (session.play && !intervalId) startLoop();
                }
                break;

            case 'command:reset':
                if (physicsMode && previusVars && previusParams) {
                    const wasPlaying = session ? session.play : false;
                    initPhysics().then(() => { if (!wasPlaying) session.play = false; });
                } else if (storedProcessedData && previusVars && previusParams) {
                    const wasPlaying = session ? session.play : false;
                    init(storedProcessedData);
                    if (!wasPlaying) session.play = false;
                }
                break;

            case 'command:stepForward':
                if (session && (physicsMode || trajectories)) {
                    session.play = false;
                    singleStep();
                    publishAllState();
                }
                break;

            case 'command:setParam':
                setParamFromGUI(data.paramName, data.value);
                previusParams[data.paramName] = data.value;
                break;

            case 'command:selectSpecies':
                selectedSpecies = data.speciesName === 'null' ? null : data.speciesName;
                //trigger rendering of new selected species by republishing current state
                publish('state:concentrations', {
                    species: selectedSpecies,
                    conc: concentrations?.[selectedSpecies]?.conc?.slice() ?? new Float64Array(0),
                });
                break;

            case 'command:setBacteriaColor':
                coloringRule[data.species] = data.color;
                publish('state:coloringRule', { ...coloringRule });
                break;

            case 'command:setSaving':
                savingState = !!data.enabled;
                break;

            case 'command:setSavingFrequency':
                freq = Math.max(1, Math.floor(data.frequency));
                break;

            case 'command:viz':
                // Relay visualization commands to scene windows
                publish('state:viz', data);
                break;

            case 'command:terminate':
                self.close();
                break;

        }
    };

    port.start();
};
