
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



export const updateAllCytoplasms = (positionMap, timeLapse, concentrationsState) => {
    let stepCounter = 0;

    for (const [id, idx] of positionMap.entries()) {
        stepCounter++;
        const numberSubsteps = 3

        for (let i=1; i<=numberSubsteps; i++){
                inheritConcentrations(id, idx, concentrationsState);
                simulateConcentrations(  speciesNames,
                    interiorManager,
                    variables,
                    parameters, 
                    intEquations,
                    id, timeLapse/numberSubsteps
                );
        }

        secretedSpeciesUpdate(variables, parameters, secretedSpecies, exteriorManager, extEquations, id, idx, concentrationsState);
    }

};
 
  

// 
function inheritConcentrations(ID, idx, concentrationsState) {
   

    for (let i = 0, len = speciesNames.length; i < len; i++) {
        const speciesName = speciesNames[i];
        const managerInt = interiorManager[speciesName];
        if (!managerInt.has(ID)) {
            const parent = lineage[ID]
            
          
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
