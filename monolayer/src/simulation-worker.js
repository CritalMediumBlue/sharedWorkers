/**
 * simulation-worker.js — SharedWorker
 * 
 * Owns the entire simulation lifecycle: state, stepping, statistics.
 * Publishes state to dashboard windows on topic-based subscriptions.
 * Receives commands from the controller window.
 */

import { createBacteriumSystem, updateSimulation, setParamFromGUI, getGlobalSpeciesConcentrations } from './simulation/simulationManager.js';
import { createStates, createHistories, createConstants, updateHistories, getHistories, resetHistories } from './simulation/stateManager.js';
import { processFileData } from './simulation/dataProcessor.js';
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
let bacteriaTimeSeries = null;
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

const TICK_MS = 16; // ≈60 Hz, similar to requestAnimationFrame

// Default colours for species (visible defaults so bacteria aren't invisible)
const defaultColors = [
    { r: 0, g: 0,  b: 0,  a: 1, intesity: 1 }
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

function init(processedData) {
    stopLoop();

    bacteriaTimeSeries = processedData.bacteriaTimeSeries;
    ({ session } = createStates());

    createBacteriumSystem(
        CONFIG, previusVars, previusParams,
        bacteriaTimeSeries[session.currentTimeStep],
        processedData.bacteriaLineage,
    );

    constants = createConstants();
    createHistories(Object.keys(previusVars.int).length);
    storedProcessedData = processedData;
    constants.numberOfTimeSteps = bacteriaTimeSeries.length;
    constants.fromStepToMinutes = constants.doublingTime / processedData.averageLifetime;
    Object.freeze(constants);

    resetHistories();
    stepCount = 0;

    publish('state:init', buildInitPayload());

    session.play = true;
    startLoop();
}

function singleStep() {
    if (!session || !bacteriaTimeSeries) return;
    if (session.currentTimeStep >= constants.numberOfTimeSteps) return;

    const currentBacteria = bacteriaTimeSeries[session.currentTimeStep];
    ({ bacteriaDataUpdated, concentrations } =
        updateSimulation(currentBacteria, constants.fromStepToMinutes));

    const globalParams = getGlobalSpeciesConcentrations(bacteriaDataUpdated);
    updateHistories(globalParams.mean, globalParams.standardDeviation);
    histories = getHistories();
    session.currentTimeStep++;
    stepCount++;
}

function publishAllState() {
    publish('state:bacteria', bacteriaDataUpdated);

    if (selectedSpecies && concentrations?.[selectedSpecies]) {
        publish('state:concentrations', {
            species: selectedSpecies,
            conc: Array.from(concentrations[selectedSpecies].conc),
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
    if (stepCount % 1 === 0) {
        publish('state:bacteria', bacteriaDataUpdated);

        if (selectedSpecies && concentrations?.[selectedSpecies]) {
            publish('state:concentrations', {
                species: selectedSpecies,
                conc: Array.from(concentrations[selectedSpecies].conc),
            });
        }

        publish('state:overlay', {
            currentTimeStep: session.currentTimeStep,
            numberOfTimeSteps: constants.numberOfTimeSteps,
            fromStepToMinutes: constants.fromStepToMinutes,
        });
    }

    if (stepCount % 1 === 0) {
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

            // ── File loading ──
            case 'command:loadEquations': {
                const _window = {};
                try {
                    const fn = new Function('window', data.text);
                    fn(_window);
                } catch (err) {
                    port.postMessage({ type: 'error', data: { message: `Equations eval failed: ${err.message}` } });
                    break;
                }
                previusVars  = _window.vars;
                previusParams = _window.params;

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

            case 'command:loadData': {
                try {
                    storedProcessedData = processFileData(data.text, data.filename);
                } catch (err) {
                    port.postMessage({ type: 'error', data: { message: `Data parse failed: ${err.message}` } });
                    break;
                }
                port.postMessage({
                    type: 'data:loaded',
                    data: { timeSteps: storedProcessedData.bacteriaTimeSeries.length,
                        fileTitle: storedProcessedData.fileTitle },
                });
                break;
            }

            // ── Simulation commands ──
            case 'command:init':
                if (storedProcessedData && previusVars && previusParams) {
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
                if (storedProcessedData && previusVars && previusParams) {
                    const wasPlaying = session ? session.play : false;
                    init(storedProcessedData);
                    if (!wasPlaying) session.play = false;
                }
                break;

            case 'command:stepForward':
                if (session && bacteriaTimeSeries) {
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
                break;

            case 'command:setBacteriaColor':
                coloringRule[data.species] = data.color;
                publish('state:coloringRule', { ...coloringRule });
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
