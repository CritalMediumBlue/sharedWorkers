import { ADI, setADIProperties, updateSinksAndSources } from "handy-diffusion";
import {
	setModel as setModelState, setParameter as setParameterState, extSpeciesNames, concentrationsState, speciesNames,
	secretedSpecies,
	interiorManager,
	exteriorManager,
	lineage,
	parameters,
	intEquations,
	extEquations,
	variables, resetModel as resetModelState
} from "./intracellular/cytoplasmState.js";
import { reactionHalfStepWithCoupling, reactionHalfStep } from "./intracellular/cytoplasmUpdater.js";

// A new model, a reset or a changed parameter (e.g. the diffusion coefficient)
// invalidates a converged field, even when the sources and sinks are unchanged.
export const setModel = (...args) => { resetDiffusionSteadyState(); resetOffGridCount(); return setModelState(...args); };
export const setParameter = (...args) => { resetDiffusionSteadyState(); return setParameterState(...args); };
export const resetModel = (...args) => { resetDiffusionSteadyState(); resetOffGridCount(); return resetModelState(...args); };


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
			...(offGridCells.has(id) && { offGrid: true }),
			phenotype: "test",
			cytoplasmConcentrations,
			extracellularConcentrations
		};
	});
	return resultArray;
};

// Cells whose position lies outside the grid in the current frame. They are kept on
// the nearest edge node (a few tracking glitches put single cells outside the chamber
// for one frame), counted, reported once, and flagged as offGrid in the output.
const offGridCells = new Set();
let offGridTotal = 0;
let warnedOffGrid = false;

/** Number of cell observations outside the grid since the model was set. */
export const offGridCount = () => offGridTotal;

function resetOffGridCount() {
	offGridTotal = 0;
	warnedOffGrid = false;
}

function getAdjustedCoordinates(x, y, HEIGHT, WIDTH, dx) {
	// Translate coordinates so (0,0) is the bottom-left corner of the grid, then round.
	const adjustedX = Math.round(-x / dx + WIDTH / 2 - 1);
	const adjustedY = Math.round(y / dx + HEIGHT / 2);

	// Clamp to grid bounds
	const clampedX = Math.min(Math.max(adjustedX, 0), WIDTH - 1);
	const clampedY = Math.min(Math.max(adjustedY, 0), HEIGHT - 1);

	// Calculate the 1D index corresponding to the 2D grid coordinates.
	return { idx: clampedY * WIDTH + clampedX, offGrid: clampedX !== adjustedX || clampedY !== adjustedY };
}

// ─── Skipping the diffusion once the field is at steady state ───────────────
//
// The extracellular field relaxes within a fraction of a second (uptake rate
// Kin/A per cell), much faster than one ODE step. While the sources and sinks do
// not change (the cells do not move within a frame, and the secretion is usually
// constant), every further ADI call reproduces the same field. Once the field
// changes by less than DIFFUSION_STEADY_TOLERANCE (relative to its maximum) in one
// ODE step, it is marked as converged together with the sources and sinks that
// produced it, and the ADI is skipped until the sources or sinks change by more
// than the same relative tolerance (a new frame, or a secretion rate that depends
// on the state of the cells). A tolerance of 0 disables the check.
const DEFAULT_STEADY_TOLERANCE = 1e-6;
const steadyState = {};   // species name -> { sources, sinks, previous, converged }

/** Largest absolute difference between two arrays, relative to the largest |b|. */
function relativeChange(a, b) {
	let maxDiff = 0, maxValue = 0;
	for (let i = 0, n = a.length; i < n; i++) {
		const d = Math.abs(a[i] - b[i]);
		if (d > maxDiff) maxDiff = d;
		const v = Math.abs(b[i]);
		if (v > maxValue) maxValue = v;
	}
	return maxValue > 0 ? maxDiff / maxValue : maxDiff;
}

function steadyStateOf(speciesName, n) {
	let s = steadyState[speciesName];
	if (!s || s.previous.length !== n) {
		s = steadyState[speciesName] = {
			sources: new Float64Array(n), sinks: new Float64Array(n),
			previous: new Float64Array(n), converged: false,
		};
	}
	return s;
}

/** Diffuse one species for one ODE step, unless its field is already at steady state. */
function diffuseSpecies(speciesName, iterations, tolerance) {
	const { conc, sources, sinks } = concentrationsState[speciesName];
	if (!(tolerance > 0)) {
		updateSinksAndSources(sinks, sources);
		ADI(conc, iterations);
		return;
	}
	const s = steadyStateOf(speciesName, conc.length);
	if (s.converged
		&& relativeChange(sources, s.sources) <= tolerance
		&& relativeChange(sinks, s.sinks) <= tolerance) {
		return;   // same sources and sinks, field already at steady state
	}
	s.previous.set(conc);
	updateSinksAndSources(sinks, sources);
	ADI(conc, iterations);
	s.converged = relativeChange(conc, s.previous) <= tolerance;
	if (s.converged) {
		s.sources.set(sources);
		s.sinks.set(sinks);
	}
}

/** Forget the converged fields (e.g. when the model is reset). */
export function resetDiffusionSteadyState() {
	for (const name of Object.keys(steadyState)) delete steadyState[name];
}

const positionMap = new Map();

function createPositionMap(currentBacteria, HEIGHT, WIDTH, dx) {
	positionMap.clear();
	offGridCells.clear();
	currentBacteria.forEach(bacterium => {
		const { x, y, id } = bacterium;
		const { idx, offGrid } = getAdjustedCoordinates(x, y, HEIGHT, WIDTH, dx);
		positionMap.set(id, idx);
		if (offGrid) offGridCells.add(id);
	});
	if (offGridCells.size) {
		offGridTotal += offGridCells.size;
		if (!warnedOffGrid) {
			warnedOffGrid = true;
			console.warn(`${offGridCells.size} cell(s) lie outside the ${WIDTH} × ${HEIGHT} grid; `
				+ 'they are coupled to the nearest edge node and flagged as offGrid in the output.');
		}
	}
}

/** A positive, finite time step of the equations file, or an error naming it. */
function timeStepParameter(name) {
	const value = parameters[name];
	if (!(Number.isFinite(value) && value > 0)) {
		throw new Error(`The equations file must define params.${name} as a positive number (got ${value}).`);
	}
	return value;
}

export const updateSignallingCircuit = (currentBacteria, HEIGHT, WIDTH, dx, durationOfOneVEStep) => {
	// ODE_TIME_STEP and ADI_TIME_STEP are defined in the ODE file (in ODE time units).
	// Defaults preserve the original dimensional behaviour (2 s and 0.5 s).
	// They are upper bounds: a frame is split into whole ODE steps and an ODE step into
	// whole ADI steps, each shortened if needed, so that both cover exactly the
	// duration of the frame (rounding the counts would diffuse for the wrong time,
	// or not at all when ODE_TIME_STEP < ADI_TIME_STEP / 2).
	const maxOdeStep = timeStepParameter('ODE_TIME_STEP');
	const maxAdiStep = timeStepParameter('ADI_TIME_STEP');
	const stepsOf = (duration, maxStep) => Math.max(1, Math.ceil(duration / maxStep - 1e-9));

	const numberOfIterations = stepsOf(durationOfOneVEStep, maxOdeStep);
	const timeLapse = durationOfOneVEStep / numberOfIterations;
	const totalNumberOfADIIterations = stepsOf(timeLapse, maxAdiStep);
	const deltaT = timeLapse / totalNumberOfADIIterations;

	createPositionMap(currentBacteria, HEIGHT, WIDTH, dx);

	setADIProperties(WIDTH, HEIGHT, parameters.DiffusionRate, dx, deltaT);
	const tolerance = parameters.DIFFUSION_STEADY_TOLERANCE ?? DEFAULT_STEADY_TOLERANCE;

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

		// First Strang half-step: reactions + couple sources/sinks to grid.
		// Every source and sink written to the grid is checked for NaN/Inf there,
		// and every grid value a cell reads back is checked in the next half-step,
		// so no scan of the whole grid is needed.
		reactionHalfStepWithCoupling(positionMap, timeLapse / 2, concentrationsState, dx, state);

		// Diffusion (grid-only, no per-bacterium state), skipped while the field is
		// at steady state for unchanged sources and sinks
		extSpeciesNames.forEach((speciesName) => {
			diffuseSpecies(speciesName, totalNumberOfADIIterations, tolerance);
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
