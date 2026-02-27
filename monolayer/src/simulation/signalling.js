import { ADI , setADIProperties, updateSinksAndSources} from "handy-diffusion";
import { setModel, setParameter, extSpeciesNames, concentrationsState,    speciesNames,
    secretedSpecies,
    interiorManager,
    exteriorManager,
    lineage,
    parameters,
    intEquations,
    extEquations,
    variables, resetModel
 } from "./intracellular/cytoplasmState.js";
import { reactionHalfStepWithCoupling, reactionHalfStep } from "./intracellular/cytoplasmUpdater.js";
export { setModel, setParameter ,resetModel};


function clearConcentrationSources() {
    extSpeciesNames.forEach((speciesName) => {
        if (concentrationsState[speciesName] && concentrationsState[speciesName].sources && concentrationsState[speciesName].sinks) {
            concentrationsState[speciesName].sources.fill(0);
            concentrationsState[speciesName].sinks.fill(0);
        }
    });
}

const calculateResultArray = (currentBacteria) => {
    
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
            parentId: lineage[id] ?? null,
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

function getAdjustedCoordinates(x, y, HEIGHT, WIDTH, dx) {
  // Translate coordinates so (0,0) is the bottom-left corner of the grid, then round.
  let adjustedX = Math.round(-x/dx + WIDTH / 2-1);
  let adjustedY = Math.round(y/dx + HEIGHT / 2);

  // Clamp to grid bounds
  if (adjustedY <= 0) adjustedY = 0;
  if (adjustedX <= 0) adjustedX = 0;
  if (adjustedY >= HEIGHT) adjustedY = HEIGHT - 1;
  if (adjustedX >= WIDTH) adjustedX = WIDTH - 1;

  // Calculate the 1D index corresponding to the 2D grid coordinates.
  return adjustedY * WIDTH + adjustedX;
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
    // ODE_TIME_STEP and ADI_TIME_STEP are defined in the ODE file (in ODE time units).
    // Defaults preserve the original dimensional behaviour (2 s and 0.5 s).
    const timeLapse = parameters.ODE_TIME_STEP ;
    const deltaT    = parameters.ADI_TIME_STEP ;

    const numberOfIterations =  Math.round(durationOfOneVEStep / timeLapse)

    createPositionMap(currentBacteria, HEIGHT, WIDTH, dx);

    setADIProperties(WIDTH, HEIGHT, parameters.DiffusionRate, dx, deltaT);

    const totalNumberOfADIIterations =  Math.round(timeLapse / deltaT)

    // Prepare state object for ODE integration
    const state = {
        speciesNames,
        secretedSpecies,
        variables,
        interiorManager,
        exteriorManager,
        lineage,
        parameters,
        intEquations,
        extEquations
    };

    for (let i = 0; i < numberOfIterations; i++) {
        clearConcentrationSources();

        // First Strang half-step: reactions + couple sources/sinks to grid
        reactionHalfStepWithCoupling(positionMap, timeLapse / 2, concentrationsState, dx, state);

        // Diffusion (grid-only, no per-bacterium state)
        extSpeciesNames.forEach((speciesName) => {
            updateSinksAndSources(concentrationsState[speciesName].sinks, concentrationsState[speciesName].sources);
            ADI(concentrationsState[speciesName].conc, totalNumberOfADIIterations, false);
        });

        // Second Strang half-step: read back from diffused grid + react
        reactionHalfStep(positionMap, timeLapse / 2, concentrationsState, state);
    }

    const resultArray = calculateResultArray(currentBacteria);

    return {
        bacteriaDataUpdated: resultArray,
        concentrations: concentrationsState,
    };
};
