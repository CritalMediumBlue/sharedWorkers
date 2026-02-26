 import { updateSignallingCircuit, setModel, setParameter, resetModel } from './signalling.js';


let WIDTH;
let HEIGHT;
let dx;
let nameOfSpecies = [];
let meanConcentrations;
    
export function createBacteriumSystem(config, vars, params, bacteriaData, lineageMap) {
    WIDTH = config.GRID.WIDTH;
    HEIGHT = config.GRID.HEIGHT;
    dx = config.GRID.dx;
    nameOfSpecies = Object.keys(vars.int);
    meanConcentrations = new Array(nameOfSpecies.length).fill(0);
    setModel(params, vars, config, bacteriaData, lineageMap);
}

export const setParamFromGUI = (paramName, newValue) => { setParameter(paramName, newValue); }


export function updateSimulation(currentBacteria, minutesPerStep, params) {
    const timeScaleSeconds = params.TIME_SCALE_SECONDS;
    const totalTimeLapse = (minutesPerStep * 60) / timeScaleSeconds;

    const { bacteriaDataUpdated, concentrations } = updateSignallingCircuit(currentBacteria, HEIGHT, WIDTH, dx, totalTimeLapse);

    return {
        bacteriaDataUpdated,
        concentrations,
    };
}


export function getGlobalSpeciesConcentrations(bacteriaData) {
    // Reset accumulators before each calculation
    meanConcentrations.fill(0);

    // Calculate mean (average) concentrations per species
    nameOfSpecies.forEach((speciesName, index) => {
        bacteriaData.forEach((bacterium) => {
            meanConcentrations[index] += bacterium.cytoplasmConcentrations[speciesName];
        });
        meanConcentrations[index] /= bacteriaData.length;
    });

    return {
        mean: meanConcentrations
    };
}
