import { describe, it, expect } from 'vitest';
import { setModel, parameters, intEquations, interiorManager } from './intracellular/cytoplasmState.js';
import * as cytoplasmState from './intracellular/cytoplasmState.js';
import { reactionHalfStep } from './intracellular/cytoplasmUpdater.js';
import * as signalling from './signalling.js';
import { createSeededMath, evaluateEquations } from './equations.js';
import { packTrajectories, frameCells, frameCount } from './trajectories.js';
import { doublingTimeMinutes } from './stateManager.js';

const config = { GRID: { WIDTH: 4, HEIGHT: 3 } };

// A one-species model dG/dt = -rate·G with one secreted species S
const makeModel = (rate, tag) => ({
    params: { rate, Kin: 30.6, tag },
    vars: {
        int: { G: { val: () => 1, eq: (vars, params) => -params.rate * vars.int.G.val } },
        ext: { S: { val: () => 0, eq: () => 0 } },
    },
});

const load = ({ params, vars }, cells = [{ id: 1 }]) =>
    setModel(params, vars, config, cells, Object.fromEntries(cells.map((c) => [c.id, 0])));

describe('setModel', () => {
    it('replaces the previous model when a new one is loaded', () => {
        load(makeModel(1, 'A'));
        expect(parameters.tag).toBe('A');
        load(makeModel(2, 'B'));
        expect(parameters.tag).toBe('B');
        expect(parameters.rate).toBe(2);
        expect(intEquations.G({ int: { G: { val: 1 } } }, parameters)).toBe(-2);
    });

    it('can be called repeatedly with the same model (reset)', () => {
        const model = makeModel(1, 'A');
        expect(() => { load(model); load(model); load(model); }).not.toThrow();
        expect(interiorManager.G.get(1)).toBe(1);
    });
});

describe('RK4 reaction step', () => {
    it('integrates exponential decay to RK4 accuracy', () => {
        const rate = 3, h = 0.1;
        load(makeModel(rate, 'decay'));
        const positionMap = new Map([[1, 0]]);
        const state = {
            speciesNames: cytoplasmState.speciesNames, secretedSpecies: cytoplasmState.secretedSpecies,
            variables: cytoplasmState.variables, interiorManager, exteriorManager: cytoplasmState.exteriorManager,
            lineage: cytoplasmState.lineage, parameters, intEquations, extEquations: cytoplasmState.extEquations,
        };
        const concentrationsState = cytoplasmState.concentrationsState;
        for (let step = 0; step < 10; step++) reactionHalfStep(positionMap, h, concentrationsState, state);
        // RK4 amplification factor for dG/dt = -rate·G, applied 10 times
        const z = -rate * h;
        const rk4 = (1 + z + z ** 2 / 2 + z ** 3 / 6 + z ** 4 / 24) ** 10;
        expect(interiorManager.G.get(1)).toBeCloseTo(rk4, 12);
        expect(interiorManager.G.get(1)).toBeCloseTo(Math.exp(-rate * h * 10), 4);
    });
});

describe('diffusion at steady state', () => {
    // A sender and a receiver (both absorbing) on a 20 x 12 grid; constant sources and sinks
    const grid = { GRID: { WIDTH: 20, HEIGHT: 12, dx: 0.5 } };
    const cells = [{ id: 1, x: 1, y: 0, angle: 0, longAxis: 2 }, { id: 2, x: -1.5, y: 1, angle: 0, longAxis: 2 }];
    const model = (tolerance) => {
        let cell = 0;
        return {
            params: { Kin: 30.6, Kout: 2.2, DiffusionRate: 40, ODE_TIME_STEP: 1, ADI_TIME_STEP: 0.2,
                      DIFFUSION_STEADY_TOLERANCE: tolerance },
            vars: {
                int: { sender: { val: () => (cell++ === 0 ? 1 : 0), eq: () => 0 } },
                ext: { S: { val: () => 0, eq: (vars, params) => params.Kout * vars.int.sender.val } },
            },
        };
    };
    const run = (tolerance, seconds = 60) => {
        const { params, vars } = model(tolerance);
        signalling.setModel(params, vars, grid, cells, { 1: 0, 2: 0 });
        const { concentrations } = signalling.updateSignallingCircuit(cells, 12, 20, 0.5, seconds);
        return Float64Array.from(concentrations.S.conc);
    };
    const maxRelativeDifference = (a, b) =>
        Math.max(...a.map((v, i) => Math.abs(v - b[i]))) / Math.max(...b.map(Math.abs));

    it('gives the same field as diffusing at every step', () => {
        expect(maxRelativeDifference(run(1e-6), run(0))).toBeLessThan(1e-5);
    });

    it('recomputes the field when a parameter changes', () => {
        const before = run(1e-6);
        signalling.setParameter('DiffusionRate', 10);
        const { concentrations } = signalling.updateSignallingCircuit(cells, 12, 20, 0.5, 60);
        expect(maxRelativeDifference(Float64Array.from(concentrations.S.conc), before)).toBeGreaterThan(1e-3);
    });
});

describe('seeded equations', () => {
    const equations = `
        window.vars = { int: { sender: { val: () => (Math.random() > window.params.prodInit ? 0 : 1), eq: () => 0 } }, ext: {} };
        window.params = { prodInit: 0.5 };`;
    const draw = (math, n = 50) => {
        const { vars } = evaluateEquations(equations, math);
        return Array.from({ length: n }, () => vars.int.sender.val());
    };

    it('reproduces the same draws for the same seed', () => {
        expect(draw(createSeededMath(42).math)).toEqual(draw(createSeededMath(42).math));
    });

    it('gives different draws for different seeds', () => {
        expect(draw(createSeededMath(1).math)).not.toEqual(draw(createSeededMath(2).math));
    });

    it('restarts the sequence on reseed, as at Initialize and Reset', () => {
        const seeded = createSeededMath(7);
        const { vars } = evaluateEquations(equations, seeded.math);
        const first = Array.from({ length: 20 }, () => vars.int.sender.val());
        seeded.reseed(7);
        const second = Array.from({ length: 20 }, () => vars.int.sender.val());
        expect(second).toEqual(first);
    });

    it('leaves the global Math.random untouched', () => {
        const seeded = createSeededMath(3);
        expect(seeded.math.random).not.toBe(Math.random);
        expect(seeded.math.exp(1)).toBe(Math.E);
    });
});

describe('packed trajectories', () => {
    const processed = {
        bacteriaTimeSeries: [
            [{ id: 1, x: 0.1, y: -2.3, angle: 0.5, longAxis: 3 }],
            [{ id: 1, x: 0.2, y: -2.2, angle: 0.52, longAxis: 4 }, { id: 2, x: 5.5, y: 1.1, angle: -0.3, longAxis: 2 }],
            [],
        ],
        bacteriaLineage: { 1: 0, 2: 1 },
        averageLifetime: 26.5,
        fileTitle: 'test.json',
    };

    it('returns every frame exactly as parsed', () => {
        const packed = packTrajectories(processed);
        expect(frameCount(packed)).toBe(3);
        processed.bacteriaTimeSeries.forEach((cells, f) => expect(frameCells(packed, f)).toEqual(cells));
        expect(packed.lineage[1]).toBe(0);
        expect(packed.lineage[2]).toBe(1);
        expect(packed.averageLifetime).toBe(26.5);
    });

    it('packs a frame range, counted from its first frame', () => {
        const packed = packTrajectories(processed, { start: 1, end: 2 });
        expect(frameCount(packed)).toBe(1);
        expect(frameCells(packed, 0)).toEqual(processed.bacteriaTimeSeries[1]);
    });

    it('survives structured cloning, as when sent to a worker', () => {
        const copy = structuredClone(packTrajectories(processed));
        expect(frameCells(copy, 1)).toEqual(processed.bacteriaTimeSeries[1]);
    });
});

describe('time steps of a frame', () => {
    // One sender, no uptake (Kin = 0), closed grid: the molecules on the grid must
    // equal Kout times the simulated time, whatever the step sizes
    const grid = { GRID: { WIDTH: 20, HEIGHT: 12, dx: 0.5 } };
    const cells = [{ id: 1, x: 0, y: 0, angle: 0, longAxis: 2 }];
    const molecules = (seconds, odeStep, adiStep) => {
        signalling.setModel(
            { Kin: 0, Kout: 2.2, DiffusionRate: 40, ODE_TIME_STEP: odeStep, ADI_TIME_STEP: adiStep, DIFFUSION_STEADY_TOLERANCE: 0 },
            { int: { sender: { val: () => 1, eq: () => 0 } }, ext: { S: { val: () => 0, eq: (vars, params) => params.Kout } } },
            grid, cells, { 1: 0 });
        const { concentrations } = signalling.updateSignallingCircuit(cells, 12, 20, 0.5, seconds);
        return concentrations.S.conc.reduce((a, b) => a + b, 0) * 0.5 * 0.5;
    };

    it('diffuses even when the ODE step is shorter than half an ADI step', () => {
        expect(molecules(1, 0.05, 0.2)).toBeCloseTo(2.2, 10);
    });

    it('covers exactly the frame when the steps do not divide it', () => {
        expect(molecules(1, 0.5, 0.2)).toBeCloseTo(2.2, 10);
        expect(molecules(1.4, 1, 0.3)).toBeCloseTo(2.2 * 1.4, 10);
        expect(molecules(101.59, 1, 0.2)).toBeCloseTo(2.2 * 101.59, 8);
    });

    it('rejects a missing time step', () => {
        expect(() => molecules(1, undefined, 0.2)).toThrow(/ODE_TIME_STEP/);
    });
});

describe('cells without a simulated parent', () => {
    it('start from the initial condition instead of NaN', () => {
        const grid = { GRID: { WIDTH: 20, HEIGHT: 12, dx: 0.5 } };
        const first = [{ id: 1, x: 0, y: 0, angle: 0, longAxis: 2 }];
        const params = { Kin: 30.6, DiffusionRate: 40, ODE_TIME_STEP: 1, ADI_TIME_STEP: 0.2 };
        const vars = { int: { G: { val: () => 5, eq: () => 0 } }, ext: { S: { val: () => 0, eq: () => 0 } } };
        // cell 2 enters later; its parent 99 was never simulated
        signalling.setModel(params, vars, grid, first, { 1: 0, 2: 99 });
        const later = [...first, { id: 2, x: 2, y: 1, angle: 0, longAxis: 2 }];
        const { bacteriaDataUpdated } = signalling.updateSignallingCircuit(later, 12, 20, 0.5, 2);
        expect(bacteriaDataUpdated.find((c) => c.id === 2).cytoplasmConcentrations.G).toBe(5);
        expect(cytoplasmState.orphanCount()).toBe(1);
    });
});

describe('cells outside the grid', () => {
    it('are coupled to the nearest edge node, counted and flagged', () => {
        const grid = { GRID: { WIDTH: 20, HEIGHT: 12, dx: 0.5 } };
        const cells = [{ id: 1, x: 0, y: 0, angle: 0, longAxis: 2 }, { id: 2, x: -40, y: 0, angle: 0, longAxis: 2 }];
        const params = { Kin: 30.6, DiffusionRate: 40, ODE_TIME_STEP: 1, ADI_TIME_STEP: 0.2 };
        const vars = { int: { G: { val: () => 1, eq: () => 0 } }, ext: { S: { val: () => 0, eq: () => 0 } } };
        signalling.setModel(params, vars, grid, cells, { 1: 0, 2: 0 });
        const { bacteriaDataUpdated } = signalling.updateSignallingCircuit(cells, 12, 20, 0.5, 1);
        expect(bacteriaDataUpdated.find((c) => c.id === 1).offGrid).toBeUndefined();
        expect(bacteriaDataUpdated.find((c) => c.id === 2).offGrid).toBe(true);
        expect(signalling.offGridCount()).toBe(1);
    });
});

describe('doubling time', () => {
    it('follows from the dilution rate alpha', () => {
        expect(doublingTimeMinutes({ alpha: 0.000257, TIME_SCALE_SECONDS: 1 })).toBeCloseTo(44.95, 2);
        expect(doublingTimeMinutes({ alpha: 0.000257 * 60, TIME_SCALE_SECONDS: 60 })).toBeCloseTo(44.95, 2);
    });

    it('can be given directly when the equations have no alpha', () => {
        expect(doublingTimeMinutes({ DOUBLING_TIME_MINUTES: 30 })).toBe(30);
    });

    it('rejects a doubling time that contradicts alpha', () => {
        expect(() => doublingTimeMinutes({ alpha: 0.000257, DOUBLING_TIME_MINUTES: 30 })).toThrow(/alpha/);
        expect(doublingTimeMinutes({ alpha: 0.000257, DOUBLING_TIME_MINUTES: 45 })).toBeCloseTo(44.95, 2);
    });

    it('falls back to 45 min', () => {
        expect(doublingTimeMinutes({})).toBe(45);
    });
});
