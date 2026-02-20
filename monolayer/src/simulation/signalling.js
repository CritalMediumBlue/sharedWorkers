import { getAdjustedCoordinates } from "./grid.js";
import { ADI , setADIProperties, updateSinksAndSources} from "handy-diffusion";
import { setModel, setParameter, extSpeciesNames, concentrationsState, parameters } from "./intracellular/cytoplasmState.js";
import { reactionHalfStepWithCoupling, reactionHalfStep, calculateResultArray } from "./intracellular/cytoplasmUpdater.js";
export { setModel, setParameter };


function clearConcentrationSources() {
    extSpeciesNames.forEach((speciesName) => {
        if (concentrationsState[speciesName] && concentrationsState[speciesName].sources && concentrationsState[speciesName].sinks) {
            concentrationsState[speciesName].sources.fill(0);
            concentrationsState[speciesName].sinks.fill(0);
        }
    });
}

const positionMap = new Map();

function createPositionMap(currentBacteria, HEIGHT, WIDTH, dx) {
    positionMap.clear();
    currentBacteria.forEach(bacterium => {
        const { x, y, id } = bacterium;
        const idx = getAdjustedCoordinates(x, y, HEIGHT, WIDTH, dx);
        positionMap.set(id, idx);
    });
}

export const updateSignallingCircuit = (currentBacteria, HEIGHT, WIDTH, dx, durationOfOneVEStep) => {
    const timeLapse = 3; // seconds. We will perform several internal iterations to reach the total duration of one VE step
    const numberOfIterations = Math.round(durationOfOneVEStep / timeLapse);

    createPositionMap(currentBacteria, HEIGHT, WIDTH, dx);

    const deltaT = 0.1;
    setADIProperties(WIDTH, HEIGHT, parameters.DiffusionRate, dx, deltaT);

    const totalNumberOfADIIterations = Math.round(timeLapse / deltaT);


    for (let i = 0; i < numberOfIterations; i++) {
        clearConcentrationSources();

        // First Strang half-step: reactions + couple sources/sinks to grid
        reactionHalfStepWithCoupling(positionMap, timeLapse / 2, concentrationsState, dx);

        // Diffusion (grid-only, no per-bacterium state)
        extSpeciesNames.forEach((speciesName) => {
            updateSinksAndSources(concentrationsState[speciesName].sinks, concentrationsState[speciesName].sources);
            ADI(concentrationsState[speciesName].conc, totalNumberOfADIIterations, false);
        });

        // Second Strang half-step: read back from diffused grid + react
        reactionHalfStep(positionMap, timeLapse / 2, concentrationsState);
    }

    const resultArray = calculateResultArray(currentBacteria);

    return {
        bacteriaDataUpdated: resultArray,
        concentrations: concentrationsState,
    };
};
