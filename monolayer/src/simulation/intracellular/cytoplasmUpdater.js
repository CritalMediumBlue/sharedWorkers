
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

import {
   simulateConcentrations,
   secretedSpeciesUpdate
} from './ODESolver.js'



function inheritConcentrations(ID, idx, concentrationsState) {
    for (let i = 0, len = speciesNames.length; i < len; i++) {
        const speciesName = speciesNames[i];
        const managerInt = interiorManager[speciesName];
        if (!managerInt.has(ID)) {
            const parent = lineage[ID];
            let defaultVal = managerInt.get(parent);
            managerInt.set(ID, defaultVal);
        }
        variables.int[speciesName].val = managerInt.get(ID);
    }

    for (let i = 0, len = secretedSpecies.length; i < len; i++) {
        const speciesName = secretedSpecies[i];
        const extManager = exteriorManager[speciesName];
        const concValue = concentrationsState[speciesName].conc[idx];
        extManager.set(ID, concValue);
        variables.ext[speciesName].val = extManager.get(ID);
    }
}

function runReactions(id, timeLapse) {
    const dt = timeLapse / 3;
    simulateConcentrations(speciesNames, interiorManager, variables, parameters, intEquations, id, dt);
    simulateConcentrations(speciesNames, interiorManager, variables, parameters, intEquations, id, dt);
    simulateConcentrations(speciesNames, interiorManager, variables, parameters, intEquations, id, dt);
}

/** First Strang half-step: react, then couple sources/sinks to the diffusion grid */
export const reactionHalfStepWithCoupling = (positionMap, timeLapse, concentrationsState, dx) => {
    for (const [id, idx] of positionMap.entries()) {
        inheritConcentrations(id, idx, concentrationsState);
        runReactions(id, timeLapse);
        secretedSpeciesUpdate(variables, parameters, secretedSpecies, exteriorManager, extEquations, id, idx, concentrationsState, dx);
    }
};

/** Second Strang half-step: read back from diffused grid, then react */
export const reactionHalfStep = (positionMap, timeLapse, concentrationsState) => {
    for (const [id, idx] of positionMap.entries()) {
        inheritConcentrations(id, idx, concentrationsState);
        runReactions(id, timeLapse);
    }
};

export const calculateResultArray = (currentBacteria) => {
    
    const resultArray = currentBacteria.map(bacterium => {
        const { id, x, y, longAxis, angle } = bacterium;
        const cytoplasmConcentrations = {};
        const extracellularConcentrations = {};
        speciesNames.forEach((speciesName) => {
            cytoplasmConcentrations[speciesName] = interiorManager[speciesName].get(id);
        });

        secretedSpecies.forEach((speciesName) => {
            extracellularConcentrations[speciesName] = exteriorManager[speciesName].get(id);
        });

        return {
            id,
            x,
            y,
            angle,
            longAxis,
            phenotype: "test",
            cytoplasmConcentrations,
            extracellularConcentrations
        };
    });
    return resultArray;
};
