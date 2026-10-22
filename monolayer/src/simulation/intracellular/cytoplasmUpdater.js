
import {
    speciesNames,
    secretedSpecies,
    variables,
    interiorManager,
    exteriorManager,
    lineage,
    parameters,
    intEquations,
    extEquations,
} from './cytoplasmState.js';

// Global NaN detector - log on first detection (don't throw - we want to see where NaN originates).
// The context is passed as a function and only built when a non-finite value is found,
// so the check costs a single comparison in the normal case.
let nanEncountered = false;
const throwOnFirstNaN = (value, makeContext) => {
    if (!Number.isFinite(value) && !nanEncountered) {
        nanEncountered = true;
        console.error(`🛑 FIRST NaN/Inf DETECTED\n${JSON.stringify(makeContext(), null, 2)}`);
        // Don't throw - let simulation continue so we can see where it comes from
    }
};

function secretedSpeciesUpdate(
    variables,
    parameters,
    secretedSpecies,
    exteriorManager,
    extEquations,
    ID,
    idx,
    concentrationsState,
    dx
) {
    const squareDx = dx * dx;
    const sink = parameters.Kin / squareDx;
    throwOnFirstNaN(sink, () => ({
        stage: 'Sink calculation',
        Kin: parameters.Kin,
        squareDx: squareDx,
        ID: ID
    }));
    for (let i = 0, len = secretedSpecies.length; i < len; i++) {
        const speciesName = secretedSpecies[i];
        const concState = concentrationsState[speciesName]; // Cache the lookup
        const extRate = extEquations[speciesName](variables, parameters);
        throwOnFirstNaN(extRate, () => ({
            stage: 'External equation evaluation',
            species: speciesName,
            extRate: extRate,
            extVariables: variables.ext,
            ID: ID,
            idx: idx,
            parameters: parameters
        }));
        concState.sources[idx] += extRate / squareDx;
        concState.sinks[idx] += sink;
        exteriorManager[speciesName].set(ID, concState.conc[idx]);
    }
} 



function inheritConcentrations(ID, idx, concentrationsState, state) {
    const { speciesNames: speciesNamesLocal, secretedSpecies: secretedSpeciesLocal, variables: variablesLocal, interiorManager: interiorManagerLocal, exteriorManager: exteriorManagerLocal, lineage: lineageLocal } = state;

    for (let i = 0, len = speciesNamesLocal.length; i < len; i++) {
        const speciesName = speciesNamesLocal[i];
        const managerInt = interiorManagerLocal[speciesName];
        if (!managerInt.has(ID)) {
            const parent = lineageLocal[ID];
            let defaultVal = managerInt.get(parent);
            throwOnFirstNaN(defaultVal, () => ({
                stage: 'Concentration inheritance',
                species: speciesName,
                ID: ID,
                parent: parent,
                inheritedValue: defaultVal
            }));
            managerInt.set(ID, defaultVal);
        }
        const val = managerInt.get(ID);
        throwOnFirstNaN(val, () => ({
            stage: 'Concentration retrieval',
            species: speciesName,
            ID: ID,
            value: val
        }));
        variablesLocal.int[speciesName].val = val;
    }

    for (let i = 0, len = secretedSpeciesLocal.length; i < len; i++) {
        const speciesName = secretedSpeciesLocal[i];
        const extManager = exteriorManagerLocal[speciesName];
        const concValue = concentrationsState[speciesName].conc[idx];
        // Replaces a full-grid scan: a non-finite grid value is caught where a cell reads it
        throwOnFirstNaN(concValue, () => ({
            stage: 'Extracellular concentration read from the diffusion grid',
            species: speciesName,
            ID: ID,
            idx: idx,
            value: concValue
        }));
        extManager.set(ID, concValue);
        variablesLocal.ext[speciesName].val = extManager.get(ID);
    }
}

/**
 * Explicit (forward) Euler method for integrating intracellular ODEs.
 * Kept for reference / fallback.
 */
function simulateConcentrationsEuler(speciesNames,
  interiorManager,
  variables,
  parameters,
  intEquations,
  ID,
  timeLapse,
  ) {
    for (let i = 0, len = speciesNames.length; i < len; i++) {
        const speciesName = speciesNames[i];
        const manager = interiorManager[speciesName];
        const origConc = manager.get(ID);
        const delta = intEquations[speciesName](variables, parameters);
        let newConc = origConc + delta * timeLapse;
        if (newConc < 0) {
            newConc = 0;
        }
        manager.set(ID, newConc);
        // Keep variables in sync so subsequent species in the same step
        // (and subsequent sub-steps) see the updated concentration.
        variables.int[speciesName].val = newConc;
    }
}

/**
 * 4th-order Runge-Kutta (RK4) method for integrating intracellular ODEs.
 *
 * All species are evaluated simultaneously at each stage (Jacobi style),
 * so coupled equations are handled correctly.
 *
 * Each stage costs one evaluation of all intEquations; total cost is 4×
 * per step compared to Euler, but with O(h⁴) local truncation error.
 *
 * The working arrays are allocated once and reused for every cell and step;
 * they are only reallocated when the number of species changes.
 */
let rk4Size = -1;
let rk4Y, rk4Stage, rk4K1, rk4K2, rk4K3, rk4K4;

function ensureRK4Buffers(n) {
    if (n === rk4Size) return;
    rk4Size = n;
    rk4Y = new Float64Array(n);
    rk4Stage = new Float64Array(n);
    rk4K1 = new Float64Array(n);
    rk4K2 = new Float64Array(n);
    rk4K3 = new Float64Array(n);
    rk4K4 = new Float64Array(n);
}

/**
 * Evaluate all reaction rates at the concentrations `conc` and write them to `rates`.
 * Sets variables.int to the provided concentrations before evaluating.
 */
function evalRates(speciesNames, variables, parameters, intEquations, conc, rates) {
    const n = speciesNames.length;
    for (let i = 0; i < n; i++) {
        variables.int[speciesNames[i]].val = conc[i];
    }
    for (let i = 0; i < n; i++) {
        const eqFunc = intEquations[speciesNames[i]];
        if (!eqFunc) {
            throw new Error(`🛑 SIMULATION STOPPED: Equation function is null/undefined for ${speciesNames[i]}`);
        }
        const rate = eqFunc(variables, parameters);
        if (rate === null || rate === undefined) {
            throw new Error(`🛑 SIMULATION STOPPED: Equation returned null/undefined for ${speciesNames[i]}\n${JSON.stringify({
                stage: 'Rate evaluation',
                species: speciesNames[i],
                rate: rate,
                variables_ext: Object.keys(variables.ext),
                extVariableS: variables.ext.S ? { val: variables.ext.S.val } : 'NOT FOUND',
                intVariables: Object.fromEntries(speciesNames.map((s) => [s, variables.int[s].val])),
                parameters: Object.keys(parameters)
            }, null, 2)}`);
        }
        throwOnFirstNaN(rate, () => ({
            stage: 'Rate evaluation',
            species: speciesNames[i],
            rate: rate,
            concentrations: Object.fromEntries(speciesNames.map((s, idx) => [s, conc[idx]])),
            parameters: parameters
        }));
        rates[i] = rate;
    }
}

function simulateConcentrationsRK4(speciesNames,
  interiorManager,
  variables,
  parameters,
  intEquations,
  ID,
  timeLapse,
  ) {
    const n = speciesNames.length;
    const h = timeLapse;
    ensureRK4Buffers(n);
    const y = rk4Y, stage = rk4Stage, k1 = rk4K1, k2 = rk4K2, k3 = rk4K3, k4 = rk4K4;

    // Read current concentrations
    for (let i = 0; i < n; i++) {
        y[i] = interiorManager[speciesNames[i]].get(ID);
    }

    // Stage 1: rates at the start of the step
    evalRates(speciesNames, variables, parameters, intEquations, y, k1);

    // Stage 2: rates at the midpoint using k1
    for (let i = 0; i < n; i++) stage[i] = Math.max(0, y[i] + (h / 2) * k1[i]);
    evalRates(speciesNames, variables, parameters, intEquations, stage, k2);

    // Stage 3: rates at the midpoint using k2
    for (let i = 0; i < n; i++) stage[i] = Math.max(0, y[i] + (h / 2) * k2[i]);
    evalRates(speciesNames, variables, parameters, intEquations, stage, k3);

    // Stage 4: rates at the end of the step using k3
    for (let i = 0; i < n; i++) stage[i] = Math.max(0, y[i] + h * k3[i]);
    evalRates(speciesNames, variables, parameters, intEquations, stage, k4);

    // Combine stages and write back
    for (let i = 0; i < n; i++) {
        let newConc = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
        throwOnFirstNaN(newConc, () => ({
            stage: 'RK4 final computation',
            species: speciesNames[i],
            originalConc: y[i],
            k_values: { k1: k1[i], k2: k2[i], k3: k3[i], k4: k4[i] },
            calculatedValue: newConc,
            h: h,
            ID: ID
        }));
        if (newConc < 0) newConc = 0;
        interiorManager[speciesNames[i]].set(ID, newConc);
        variables.int[speciesNames[i]].val = newConc;
    }
}

// Active integrator — swap to simulateConcentrationsEuler to revert
const simulateConcentrations = simulateConcentrationsRK4;


/** First Strang half-step: react, then couple sources/sinks to the diffusion grid */
export const reactionHalfStepWithCoupling = (positionMap, timeLapse, concentrationsState, dx, state = {
    speciesNames, secretedSpecies, variables, interiorManager, exteriorManager, lineage, parameters, intEquations, extEquations
}) => {
    for (const [id, idx] of positionMap.entries()) {
        inheritConcentrations(id, idx, concentrationsState, state);
        simulateConcentrations(state.speciesNames, state.interiorManager, state.variables, state.parameters, state.intEquations, id, timeLapse);
        secretedSpeciesUpdate(state.variables, state.parameters, state.secretedSpecies, state.exteriorManager, state.extEquations, id, idx, concentrationsState, dx);
    }
};

/** Second Strang half-step: read back from diffused grid, then react */
export const reactionHalfStep = (positionMap, timeLapse, concentrationsState, state = {
    speciesNames, variables, interiorManager, lineage, parameters, intEquations
}) => {
    for (const [id, idx] of positionMap.entries()) {
        inheritConcentrations(id, idx, concentrationsState, state);
        simulateConcentrations(state.speciesNames, state.interiorManager, state.variables, state.parameters, state.intEquations, id, timeLapse);
    }
};
