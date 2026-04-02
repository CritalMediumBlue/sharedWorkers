/**
 * generationRules.js
 *
 * Loads and validates a user-provided JS file that defines the physical growth
 * rules for the bacteria. The file must follow the same `window.rules` /
 * `window.physicsParams` convention already used by ODE.js for `window.vars` /
 * `window.params`.
 *
 * Expected file shape:
 *
 *   window.physicsParams = {
 *     PHYSICS_DT:       0.01,   // seconds per Rapier sub-step
 *     BACTERIUM_RADIUS: 0.5,    // µm — capsule end-cap radius
 *     DIVISION_LENGTH:  6.0,    // µm — longAxis threshold that triggers division
 *     BASE_GROWTH_RATE: 0.001,  // µm/s — baseline elongation rate
 *     MINUTES_PER_STEP: 0.1,    // minutes of ODE/PDE time per physics tick
 *   };
 *
 *   window.rules = {
 *     // Returns a scalar multiplier applied to BASE_GROWTH_RATE.
 *     // `bacterium`   — { id, x, y, angle, longAxis }
 *     // `chem`        — Map<id, { [speciesName]: concentration }>
 *     // `params`      — physicsParams
 *     growthRateModifier: (bacterium, chem, params) => 1.0,
 *
 *     // Called just after a division event.
 *     // `parent`    — snapshot of the dividing bacterium
 *     // `daughters` — [{ id, x, y, angle, longAxis }, ...]  (two entries)
 *     // `params`    — physicsParams
 *     // Return value is ignored; use for side-effects (e.g. logging).
 *     onDivide: (parent, daughters, params) => {},
 *   };
 */

/** Required keys that must be present in window.physicsParams */
const REQUIRED_PHYSICS_PARAMS = [
    'PHYSICS_DT',
    'BACTERIUM_RADIUS',
    'DIVISION_LENGTH',
    'BASE_GROWTH_RATE',
    'MINUTES_PER_STEP',
];

/** Required function hooks that must be present in window.rules */
const REQUIRED_RULE_HOOKS = [
    'growthRateModifier',
    'onDivide',
];

/**
 * Evaluates a user-provided generation-rules JS file and returns the validated
 * `rules` and `physicsParams` objects.
 *
 * @param {string} text - Raw JS source text of the rules file.
 * @returns {{ rules: object, physicsParams: object }}
 * @throws {Error} If the file cannot be evaluated or required keys are missing.
 */
export function loadRules(text) {
    const _window = {};

    try {
        const fn = new Function('window', text);
        fn(_window);
    } catch (err) {
        throw new Error(`Generation rules eval failed: ${err.message}`);
    }

    // ── Validate physicsParams ──────────────────────────────────────────────
    if (!_window.physicsParams || typeof _window.physicsParams !== 'object') {
        throw new Error(
            'Generation rules file must define `window.physicsParams` as an object.'
        );
    }

    const missingParams = REQUIRED_PHYSICS_PARAMS.filter(
        (k) => !(_window.physicsParams.hasOwnProperty(k))
    );
    if (missingParams.length > 0) {
        throw new Error(
            `window.physicsParams is missing required keys: ${missingParams.join(', ')}`
        );
    }

    // ── Validate rules ──────────────────────────────────────────────────────
    if (!_window.rules || typeof _window.rules !== 'object') {
        throw new Error(
            'Generation rules file must define `window.rules` as an object.'
        );
    }

    const missingHooks = REQUIRED_RULE_HOOKS.filter(
        (k) => typeof _window.rules[k] !== 'function'
    );
    if (missingHooks.length > 0) {
        throw new Error(
            `window.rules is missing required function hooks: ${missingHooks.join(', ')}`
        );
    }

    return {
        rules: _window.rules,
        physicsParams: _window.physicsParams,
    };
}
