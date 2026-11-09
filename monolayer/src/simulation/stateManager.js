
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
    };
    return sealObject(constants);
} 

const FALLBACK_DOUBLING_TIME_MINUTES = 45;
let warnedFallback = false;

/**
 * Doubling time of the cells in minutes, as implied by the model. The cells grow
 * at the dilution rate `alpha` of the equations, so they double in ln 2 / alpha
 * (in the time unit of the equations, TIME_SCALE_SECONDS seconds). Deriving the
 * frame duration from it keeps dilution and colony growth consistent, also when
 * alpha is changed or swept. Equations files without `alpha` can set
 * DOUBLING_TIME_MINUTES instead; if both are set, they must agree to 1 %.
 * Without either, 45 min is assumed, with a warning.
 */
export const doublingTimeMinutes = (params = {}) => {
    const { alpha, TIME_SCALE_SECONDS: scale = 1, DOUBLING_TIME_MINUTES: given } = params;
    const hasGiven = Number.isFinite(given) && given > 0;
    if (Number.isFinite(alpha) && alpha > 0) {
        const fromAlpha = (Math.LN2 / alpha) * scale / 60;
        if (hasGiven && Math.abs(given / fromAlpha - 1) > 0.01) {
            throw new Error(`DOUBLING_TIME_MINUTES = ${given} disagrees with ln 2 / alpha = ${fromAlpha.toFixed(2)} min; set only one of them.`);
        }
        return fromAlpha;
    }
    if (hasGiven) return given;
    if (!warnedFallback) {
        warnedFallback = true;
        console.warn(`The equations define neither alpha nor DOUBLING_TIME_MINUTES; assuming a doubling time of ${FALLBACK_DOUBLING_TIME_MINUTES} min.`);
    }
    return FALLBACK_DOUBLING_TIME_MINUTES;
};

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
