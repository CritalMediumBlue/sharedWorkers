import { describe, it, expect } from 'vitest';
import { setModel, parameters, intEquations, interiorManager } from './intracellular/cytoplasmState.js';
import * as cytoplasmState from './intracellular/cytoplasmState.js';
import { reactionHalfStep } from './intracellular/cytoplasmUpdater.js';
import { createSeededMath, evaluateEquations } from './equations.js';
import { packTrajectories, frameCells, frameCount } from './trajectories.js';

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
