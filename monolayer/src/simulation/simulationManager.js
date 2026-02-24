 import { updateSignallingCircuit, setModel,setParameter , resetModel} from './signalling.js';


let WIDTH;
let HEIGHT;
let dx;
let nameOfSpecies = [];
let meanConcentrations ;
let stdDeviations;         
    
export function createBacteriumSystem(config, vars, params, bacteriaData,lineageMap) {
    
    WIDTH = config.GRID.WIDTH;
    HEIGHT = config.GRID.HEIGHT;
    dx = config.GRID.dx;
    nameOfSpecies = Object.keys(vars.int);
     meanConcentrations = new Array(nameOfSpecies.length).fill(0);
     stdDeviations = new Array(nameOfSpecies.length).fill(0);
    setModel(params, vars,config, bacteriaData, lineageMap);

    

}

export const setParamFromGUI = (paramName, newValue) => {setParameter(paramName, newValue);}


export function updateSimulation(currentBacteria, minutesPerStep, params) { //one step
    // Convert minutes per step → seconds per step, then scale to ODE time units.
    // TIME_SCALE_SECONDS = 1 for dimensional ODEs (seconds), or the characteristic
    // time scale t_scale (in seconds) for non-dimensional ODEs.
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
    stdDeviations.fill(0);

    // Calculate mean (average) concentrations per species
    nameOfSpecies.forEach((speciesName, index) => {
        bacteriaData.forEach((bacterium) => {
            meanConcentrations[index] += bacterium.cytoplasmConcentrations[speciesName];
        });
        meanConcentrations[index] /= bacteriaData.length;
    });

    // Calculate standard deviation per species
    nameOfSpecies.forEach((speciesName, index) => {
        bacteriaData.forEach((bacterium) => {
            const diff = bacterium.cytoplasmConcentrations[speciesName] - meanConcentrations[index];
            stdDeviations[index] += diff * diff;
        });
        stdDeviations[index] = Math.sqrt(stdDeviations[index] / bacteriaData.length);
    });

    return {
        mean: meanConcentrations,
        standardDeviation: stdDeviations
    };
}
