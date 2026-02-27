
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
    for (let i = 0, len = secretedSpecies.length; i < len; i++) {
        const speciesName = secretedSpecies[i];
        const concState = concentrationsState[speciesName]; // Cache the lookup
        concState.sources[idx] += extEquations[speciesName](variables, parameters) / squareDx ;
        concState.sinks[idx] += parameters.Kin / squareDx ;
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
            managerInt.set(ID, defaultVal);
        }
        variablesLocal.int[speciesName].val = managerInt.get(ID);
    }

    for (let i = 0, len = secretedSpeciesLocal.length; i < len; i++) {
        const speciesName = secretedSpeciesLocal[i];
        const extManager = exteriorManagerLocal[speciesName];
        const concValue = concentrationsState[speciesName].conc[idx];
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
 */
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

    // Read current concentrations into a local array
    const y = new Array(n);
    for (let i = 0; i < n; i++) {
        y[i] = interiorManager[speciesNames[i]].get(ID);
    }

    /**
     * Evaluate all reaction rates given a concentration vector.
     * Sets variables.int to the provided concentrations before evaluating.
     * @param {number[]} conc
     * @returns {number[]} rates
     */
    function evalRates(conc) {
        for (let i = 0; i < n; i++) {
            variables.int[speciesNames[i]].val = conc[i];
        }
        const rates = new Array(n);
        for (let i = 0; i < n; i++) {
            rates[i] = intEquations[speciesNames[i]](variables, parameters);
        }
        return rates;
    }

    // Stage 1: rates at the start of the step
    const k1 = evalRates(y);

    // Stage 2: rates at the midpoint using k1
    const y2 = new Array(n);
    for (let i = 0; i < n; i++) {
        y2[i] = Math.max(0, y[i] + (h / 2) * k1[i]);
    }
    const k2 = evalRates(y2);

    // Stage 3: rates at the midpoint using k2
    const y3 = new Array(n);
    for (let i = 0; i < n; i++) {
        y3[i] = Math.max(0, y[i] + (h / 2) * k2[i]);
    }
    const k3 = evalRates(y3);

    // Stage 4: rates at the end of the step using k3
    const y4 = new Array(n);
    for (let i = 0; i < n; i++) {
        y4[i] = Math.max(0, y[i] + h * k3[i]);
    }
    const k4 = evalRates(y4);

    // Combine stages and write back
    for (let i = 0; i < n; i++) {
        let newConc = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
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
