
export const createStates = () => {
    const session = {
        /** @type {number | null} */ animationFrameId: null, // ID for requestAnimationFrame
        /** @type {number} */ currentTimeStep: 1, // Current step in the simulation playback
        /** @type {boolean} */ play: false, // Controls whether the animation is running
    }; 
    sealObject(session);
 
    return {
        session
    }
}

export const createConstants = () => {
    const constants = {
        numberOfTimeSteps: 0, // Total number of time steps in the simulation
        fromStepToMinutes: 0, // Conversion factor from simulation steps to minutes
        doublingTime: 45 // the average bacteria doubling time is 45 minutes
    };
    return sealObject(constants);
} 

const sealObject = (obj) => {
    Object.seal(obj);
    Object.preventExtensions(obj);
    return obj;
}



// Dynamic history arrays storage
let numberOfSpecies = 0;
let meanHistories = [];

/**
 * Initialize history arrays for a specific number of time series
 * @param {number} speciesCount - Number of time series/species to track
 */
export const createHistories = (speciesCount) => {
    numberOfSpecies = speciesCount;
    meanHistories = Array.from({ length: speciesCount }, () => []);
}

/**
 * Reset all history arrays to empty
 */
export const resetHistories = () => {
    if (numberOfSpecies === 0) return;
    meanHistories = Array.from({ length: numberOfSpecies }, () => []);
}

/**
 * Update history arrays with new mean data
 * @param {Array<number>} means - Array of mean values for each species
 */
export const updateHistories = (means) => {
    const meansToUpdate = means.slice(0, numberOfSpecies);
    meansToUpdate.forEach((mean, index) => {
        meanHistories[index].push(mean);
    });
};

/**
 * Get all history arrays
 * @returns {Array} Array containing mean history data series
 */
export const getHistories = () => {
    const dataLength = meanHistories[0]?.length || 0;
    const timeIndices = Array.from({ length: dataLength }, (_, index) => index);
    const means = [timeIndices, ...meanHistories];
    return [means];
};
