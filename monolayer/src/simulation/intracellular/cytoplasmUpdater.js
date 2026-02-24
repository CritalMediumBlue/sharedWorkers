
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

function simulateConcentrations(speciesNames,
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

