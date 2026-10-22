import { describe, it, expect } from 'vitest';
import { setModel, parameters, intEquations, interiorManager } from './intracellular/cytoplasmState.js';
import * as cytoplasmState from './intracellular/cytoplasmState.js';
import { reactionHalfStep } from './intracellular/cytoplasmUpdater.js';

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
