/**
 * generationRules.js — Example generation rules file
 *
 * This file defines the physical growth rules for the bacteria in physics mode.
 * It follows the same `window.rules` / `window.physicsParams` convention used
 * by ODE.js for `window.vars` / `window.params`.
 *
 * Load this file via the "Load generation rules" button inside the
 * "Generate Trajectories from Scratch" folder on the Execution tab.
 *
 * ─── How it works ────────────────────────────────────────────────────────────
 *
 * Each physics tick, physicsManager.js calls:
 *
 *   const modifier = rules.growthRateModifier(bacterium, chem, physicsParams);
 *   const effectiveGrowthRate = physicsParams.BASE_GROWTH_RATE * modifier;
 *
 * where:
 *   bacterium  — { id, x, y, angle, longAxis }  (current Rapier snapshot)
 *   chem       — { [speciesName]: concentration } (from the previous ODE tick)
 *   physicsParams — this object
 *
 * When a bacterium's longAxis reaches DIVISION_LENGTH, divideBody() is called
 * automatically and rules.onDivide() is notified.
 *
 * ─── Coupling example ────────────────────────────────────────────────────────
 *
 * The example below shows how to use the concentration of protein "F" (from
 * the default ODE.js system) to modulate the growth rate:
 *
 *   - Bacteria with high [F] grow faster (up to 2× baseline)
 *   - Bacteria with low  [F] grow at the baseline rate
 *
 * Replace or extend growthRateModifier() with your own coupling logic.
 */

window.physicsParams = {
    // ── Time ──────────────────────────────────────────────────────────────────
    /** Rapier sub-step size in seconds. Smaller = more accurate, more CPU. */
    PHYSICS_DT: 0.05,

    /** Minutes of ODE/PDE time that elapse per physics tick.
     *  This drives constants.fromStepToMinutes in the worker.
     *  Set to match your ODE_TIME_STEP / 60 for a 1:1 coupling. */
    MINUTES_PER_STEP: 0.05,   // ≈ 3 seconds of biological time per tick

    // ── Geometry ──────────────────────────────────────────────────────────────
    /** End-cap radius of the capsule collider in µm. */
    BACTERIUM_RADIUS: 0.5,

    /** Total tip-to-tip length (µm) at which a bacterium divides. */
    DIVISION_LENGTH: 6.0,

    // ── Growth ────────────────────────────────────────────────────────────────
    /** Baseline elongation rate in µm/s (before the modifier is applied). */
    BASE_GROWTH_RATE: 0.002,

    // ── Coupling ──────────────────────────────────────────────────────────────
    /** Name of the intracellular species whose concentration modulates growth.
     *  Must match a key in window.vars.int from the loaded equations file. */
    GROWTH_MODULATOR_SPECIES: 'F',

    /** Concentration (nM) at which the growth rate modifier saturates at 2×. */
    MODULATOR_SATURATION: 150,

    // ── Domain boundary (µm) ─────────────────────────────────────────────────
    /** Full width of the simulation grid in µm (matches CONFIG.GRID.WIDTH).
     *  Bacteria whose |x| > GRID_WIDTH/2 are removed from the physics world. */
    GRID_WIDTH: 200,

    /** Full height of the simulation grid in µm (matches CONFIG.GRID.HEIGHT).
     *  Bacteria whose |y| > GRID_HEIGHT/2 are removed from the physics world. */
    GRID_HEIGHT: 120,
};


window.rules = {

    /**
     * Returns a scalar multiplier for the baseline growth rate.
     *
     * @param {{ id: number, x: number, y: number, angle: number, longAxis: number }} bacterium
     * @param {{ [speciesName]: number }} chem  — intracellular concentrations from the previous ODE tick
     * @param {object} params — physicsParams (this object)
     * @returns {number} Multiplier ≥ 0. Return 1.0 for no modulation.
     */
    growthRateModifier(bacterium, chem, params) {
        const species = params.GROWTH_MODULATOR_SPECIES;
        const conc = chem[species] ?? 0;

        // Simple saturating Hill-like function:
        //   modifier = 1 + conc / (conc + K_sat)
        // At conc = 0        → modifier = 1.0  (baseline)
        // At conc = K_sat    → modifier = 1.5
        // At conc → ∞        → modifier → 2.0
        const K_sat = params.MODULATOR_SATURATION;
        return 1.0 + conc / (conc + K_sat);
    },

    /**
     * Called immediately after a division event.
     * Use this hook for logging, custom daughter initialisation, etc.
     * The return value is ignored.
     *
     * @param {{ id: number, x: number, y: number, angle: number, longAxis: number }} parent
     *   Snapshot of the dividing bacterium (taken just before removal).
     * @param {Array<{ id: number, x: number, y: number, angle: number, longAxis: number }>} daughters
     *   Snapshots of the two newly created daughter cells.
     * @param {object} params — physicsParams
     */
    onDivide(parent, daughters, params) {
        // Example: log division events to the console
        console.log(
            `[Division] bacterium ${parent.id} → daughters ${daughters.map(d => d.id).join(', ')}` +
            ` at (${parent.x.toFixed(2)}, ${parent.y.toFixed(2)})`
        );
    },
};
