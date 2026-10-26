/**
 * controller-view.js — Controller window.
 *
 * Provides Tweakpane GUI for:
 *   • Loading data (.json) and equations (.js) files
 *   • Initializing / running / pausing / resetting the simulation
 *   • Adjusting ODE parameters via sliders
 *   • Opening dashboard windows (3D scene, plot, overlay)
 *
 * All simulation commands are sent to the SharedWorker.
 *
 * Each simulation is a SharedWorker identified by its name. Names are unique
 * within this page, and a name already in use by another window is only
 * reused if the user explicitly chooses to attach to that simulation.
 */

import { connectToWorker, probeWorker } from '../lib/worker-client.js';
import { createControllerUI } from './controller-ui.js';
import { wireControllerHandlers } from './controller-handlers.js';
import { randomSeed } from '../simulation/equations.js';

// Simulation names used in this controller page
const usedNames = new Set();

// Simulations created by this page (attached ones run elsewhere and add no load).
// Each simulation is one thread. navigator.hardwareConcurrency counts hardware
// threads, typically two per physical core, and a CPU-bound simulation gains little
// from the second thread of a core: measured on a 6-core/12-thread Xeon, 5
// simulations ran at ≈5 frames/s in total and 11 at only ≈6. Beyond about half the
// reported count the page therefore asks for confirmation (a soft limit, not a cap).
let ownedCount = 0;
const recommendedMax = Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2));

const confirmBeyondRecommended = () => ownedCount < recommendedMax || confirm(
    `This page already runs ${ownedCount} simulations. This computer has about ${recommendedMax} `
    + 'physical CPU cores, so additional simulations add little speed in total and slow all of them '
    + 'down. Each one also keeps its own copy of the trajectory data in memory (about 0.17 GB for '
    + 'LowRes.json).\n\n'
    + 'For many runs, the headless batch runner (npm run batch) is better suited.\n\n'
    + 'Create another simulation anyway?');

const nextFreeName = () => {
    let i = 1;
    while (usedNames.has(String(i))) i++;
    return String(i);
};

/**
 * Prompt for a simulation name until it is unused in this page and either
 * unused in other windows or (if `allowAttach`) the user chooses to attach to
 * the simulation of that name running elsewhere.
 *
 * @returns {Promise<{ name: string, owner: boolean, seed: number } | null>} null if cancelled
 */
async function chooseSimulationName(message, allowAttach) {
    let suggestion = nextFreeName();
    for (;;) {
        const input = prompt(message, suggestion);
        if (input === null) return null;
        const name = input.trim();
        if (!name) {
            alert('Simulation name cannot be empty.');
            continue;
        }
        if (usedNames.has(name)) {
            alert(`A simulation named "${name}" already exists in this window.`);
            suggestion = nextFreeName();
            continue;
        }
        const { fresh, seed } = await probeWorker(name);
        if (fresh) return confirmBeyondRecommended() ? { name, owner: true, seed } : null;
        if (allowAttach && confirm(`A simulation named "${name}" is already running in another window. Attach to it?`)) {
            return { name, owner: false, seed };
        }
        if (!allowAttach) alert(`A simulation named "${name}" is already running in another window.`);
        suggestion = nextFreeName();
    }
}

export async function mountControllerView() {
    const choice = await chooseSimulationName('Enter name for the simulation:', true);
    if (choice) initializeNewSimulation(choice);
}

/** Clone: same files, parameters, settings and bacteria colours, a new seed, a new unique name. */
async function cloneSimulation(sourceState) {
    const choice = await chooseSimulationName('Enter name for the new simulation:', false);
    if (!choice) return;
    initializeNewSimulation(choice, {
        equationsText: sourceState.equationsText,
        equationsFileTitle: sourceState.equations?.fileTitle || sourceState.equationsFileTitle,
        trajectories: sourceState.trajectories,   // shared by reference in this page
        dataFileTitle: sourceState.dataFileTitle,
        paramOverrides: { ...sourceState.paramOverrides },
        physicsEnabled: sourceState.physicsEnabled,
        savingEnabled: sourceState.savingEnabled,
        savingFrequency: sourceState.savingFrequency,
        bacteriaColors: Object.fromEntries(
            Object.entries(sourceState.bacteriaColors).map(([species, color]) => [species, { ...color }])),
    });
}

function initializeNewSimulation({ name: workerName, owner, seed: workerSeed }, cloneData = null) {
    usedNames.add(workerName);
    if (owner) ownedCount++;

    const paneDiv = document.createElement('div');
    paneDiv.id = 'pane';
    document.body.appendChild(paneDiv);

    const ui = createControllerUI(paneDiv, workerName);

    const state = {
        workerName,
        ownsWorker: owner,   // only the creating controller terminates the worker
        dataLoaded: false,
        equationsLoaded: false,
        equations: null,
        data: null,
        dataFileTitle: '',
        equationsText: '',
        trajectories: null,    // packed trajectory data (trajectories.js)
        // Run configuration, copied by clones
        seed: owner ? randomSeed() : workerSeed,
        paramOverrides: {},
        physicsEnabled: false,
        savingEnabled: true,   // the worker saves by default
        savingFrequency: 40,
        bacteriaColors: {},    // species → { r, g, b, a, intensity } used to colour the bacteria
    };

    let send = () => {};
    const { onMessage } = wireControllerHandlers({
        sendMessage: (msg) => send(msg),
        ui,
        state,
        cloneSimulation,
    });

    ({ send } = connectToWorker(
        ['equations:loaded', 'data:loaded', 'error', 'state:save'],
        onMessage,
        workerName
    ));

    ui.seedState.seed = state.seed;
    ui.seedBinding.refresh();
    if (owner) send({ type: 'command:setSeed', data: { seed: state.seed } });

    if (cloneData) {
        // Settings first, so that they are in place when the files arrive
        Object.assign(state, {
            equationsText: cloneData.equationsText,
            equationsFileTitle: cloneData.equationsFileTitle,
            trajectories: cloneData.trajectories,
            dataFileTitle: cloneData.dataFileTitle,
            paramOverrides: cloneData.paramOverrides,
            physicsEnabled: cloneData.physicsEnabled,
            savingEnabled: cloneData.savingEnabled,
            savingFrequency: cloneData.savingFrequency,
            bacteriaColors: cloneData.bacteriaColors,
        });
        ui.physicsState.enabled = cloneData.physicsEnabled;
        ui.physicsToggle.refresh();
        send({ type: 'command:setPhysicsMode', data: { enabled: cloneData.physicsEnabled } });
        send({ type: 'command:setSaving', data: { enabled: cloneData.savingEnabled } });
        send({ type: 'command:setSavingFrequency', data: { frequency: cloneData.savingFrequency } });
        // The parameter overrides are applied when the worker confirms the
        // equations (equations:loaded), see controller-handlers.js.
        send({ type: 'command:loadEquations', data: { text: cloneData.equationsText, filename: cloneData.equationsFileTitle || 'equations.js' } });
        if (cloneData.trajectories) {
            send({ type: 'command:loadTrajectories', data: { trajectories: cloneData.trajectories } });
        }
    }
}
