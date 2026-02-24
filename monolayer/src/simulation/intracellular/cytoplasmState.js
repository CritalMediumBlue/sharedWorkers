
export const variables = {};
export const parameters = {};
export const interiorManager = {};
export const exteriorManager = {};
export const intSpeciesNames = [];
export const extSpeciesNames = [];
export const concentrationsState = {};
export const intEquations = {}
export const extEquations = {}
let initialIntConFunct = {};
let initialExtConFunct = {};

export let speciesNames = null;
export let secretedSpecies = null;
export let lineage = null;


const setSpeciesNames = (names) => { speciesNames = names; };
const setSecretedSpecies = (species) => { secretedSpecies = species; };

export const setModel = (params, vars, config, bacteriaData, lineageMap) => {
    if (Object.keys(parameters).length === 0 || Object.keys(variables).length === 0){
        Object.assign(parameters, params);
        Object.assign(variables, vars);
    }
    
    const speciesNamesLocal = Object.keys(variables.int);
    const secretedSpeciesLocal = Object.keys(variables.ext);
    
    // Set internal state
    setSpeciesNames(speciesNamesLocal);
    setSecretedSpecies(secretedSpeciesLocal);
    
    const gridSize = config.GRID.WIDTH * config.GRID.HEIGHT;

    initializeSpecies(variables.int, intSpeciesNames, interiorManager, false, gridSize);
    initializeSpecies(variables.ext, extSpeciesNames, exteriorManager, true, gridSize);
    lockObjects([interiorManager, exteriorManager, concentrationsState, variables, parameters]);
    setCytopManager(bacteriaData,lineageMap);


    return concentrationsState;
};

function initializeSpecies(speciesObj, speciesNames, manager, isExternal, gridSize) {
    speciesNames.splice(0, speciesNames.length, ...Object.keys(speciesObj));
    
speciesNames.forEach((speciesName) => {
    manager[speciesName] = new Map();
    
    // Only store equations for species that exist in the respective compartments
    if (variables.int[speciesName]) {
        intEquations[speciesName] = variables.int[speciesName].eq;  // Store function reference
    }
    if (variables.ext[speciesName]) {
        extEquations[speciesName] = variables.ext[speciesName].eq;  // Store function reference
    }
    
    if (isExternal) {
        concentrationsState[speciesName] = {
            conc: new Float64Array(gridSize).fill(0),
            sources: new Float64Array(gridSize).fill(0),
            sinks: new Float64Array(gridSize).fill(0)
        };
    }
});

}

function lockObjects(objectArray) {
    objectArray.forEach(obj => {
        Object.seal(obj); 
        Object.preventExtensions(obj);
    });
}

const setCytopManager = (bacteriaData, lineageMap) => { 
    bacteriaData.forEach((bacterium) => { 
        const ID = bacterium.id; 
        intSpeciesNames.forEach((speciesName) => { 
            if (initialIntConFunct[speciesName] === null || initialIntConFunct[speciesName] === undefined) 
            {
                interiorManager[speciesName].set(ID, variables.int[speciesName].val()); 
                initialIntConFunct[speciesName] = variables.int[speciesName].val;
            } else {
                interiorManager[speciesName].set(ID, initialIntConFunct[speciesName]()); 
            }
        }); 
        extSpeciesNames.forEach((speciesName) => { 
            if (initialExtConFunct[speciesName] === null || initialExtConFunct[speciesName] === undefined) 
            {
                exteriorManager[speciesName].set(ID, variables.ext[speciesName].val()); 
                initialExtConFunct[speciesName] = variables.ext[speciesName].val;
            } else {
                exteriorManager[speciesName].set(ID, initialExtConFunct[speciesName]()); 
            }
 


        }); 
    }); 
    lineage=lineageMap
    
};

export const setParameter = (paramName, value) => {
    parameters[paramName] = value;
};

/**
 * Resets all model state to allow re-initialization.
 * Useful for testing and switching between different ODE systems.
 */
export const resetModel = () => {
    // Clear all manager Maps
    Object.keys(interiorManager).forEach(key => {
        if (interiorManager[key] instanceof Map) {
            interiorManager[key].clear();
        }
        delete interiorManager[key];
    });
    
    Object.keys(exteriorManager).forEach(key => {
        if (exteriorManager[key] instanceof Map) {
            exteriorManager[key].clear();
        }
        delete exteriorManager[key];
    });
    
    // Clear arrays
    intSpeciesNames.length = 0;
    extSpeciesNames.length = 0;
    
    // Clear concentration state
    Object.keys(concentrationsState).forEach(key => {
        delete concentrationsState[key];
    });
    
    // Clear equations
    Object.keys(intEquations).forEach(key => delete intEquations[key]);
    Object.keys(extEquations).forEach(key => delete extEquations[key]);
    
    // Clear variables and parameters
    Object.keys(variables).forEach(key => delete variables[key]);
    Object.keys(parameters).forEach(key => delete parameters[key]);
    
    // Reset module-level state
    speciesNames = null;
    secretedSpecies = null;
    lineage = null;
    
    // Clear initial concentration function caches
    initialIntConFunct = {};
    initialExtConFunct = {};
};
