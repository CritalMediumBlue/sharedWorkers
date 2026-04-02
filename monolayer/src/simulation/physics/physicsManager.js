/**
 * physicsManager.js
 *
 * Public API for the minimal single-capsule physics layer. This is the only
 * module that simulation-worker.js needs to import from the physics folder.
 *
 * Responsibilities:
 *   - Orchestrate physicsWorld.js (Rapier lifecycle, body creation, stepping)
 *   - Store the init config so the capsule's fixed dimensions and ID are
 *     available when building the snapshot
 *   - Expose getBacteriaSnapshot() returning a single-entry array in the
 *     { id, x, y, angle, longAxis } format consumed by updateSignallingCircuit()
 *
 * No growth, no division, no rules file. The capsule has fixed dimensions
 * set at init time. This minimal scope is intentional — coupling to the
 * chemical layer and colony dynamics will be added in later iterations.
 *
 * Usage (from simulation-worker.js):
 *
 *   import * as physicsManager from './simulation/physics/physicsManager.js';
 *
 *   await physicsManager.init({
 *       id: 'b0', x: 0, y: 0, angle: 0, halfLength: 1.5, radius: 0.5
 *   });
 *
 *   physicsManager.step(dt);
 *   const currentBacteria = physicsManager.getBacteriaSnapshot();
 *   // → [{ id: 'b0', x: 0, y: 0, angle: 0, longAxis: 4 }]
 *
 *   physicsManager.destroy();
 */

import {
    init as initWorld,
    step as stepWorld,
    getBodyState,
    destroy as destroyWorld,
    applyForce,
} from './physicsWorld.js';

// ── Module state ──────────────────────────────────────────────────────────────

/** @type {{ id: string, halfLength: number, radius: number } | null} */
let _config = null;

/** Pre-computed total tip-to-tip length (µm): 2 * halfLength + 2 * radius */
let _longAxis = 0;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Initialises the physics world and creates a single capsule body.
 *
 * Must be awaited. Safe to call multiple times (re-initialises on each call).
 *
 * @param {{ id: string, x: number, y: number, angle: number, halfLength: number, radius: number }} config
 *   - id:          bacterium identifier (e.g. "b0")
 *   - x, y:        initial position (µm)
 *   - angle:        initial orientation (radians)
 *   - halfLength:   half-height of the capsule's cylindrical section (µm)
 *   - radius:       capsule end-cap radius (µm)
 * @returns {Promise<void>}
 */
export async function init(config) {
    _config = config;
    _longAxis = 2 * config.halfLength + 2 * config.radius;
    await initWorld(config);
}

/**
 * Advances the physics world by one time step.
 *
 * @param {number} dt - Time step in seconds.
 */
export function step(dt) {
    // Random force for testing — remove later
    const magnitude = 1;
    applyForce({
        x: (Math.random() - 0.5) * magnitude,
        y: (Math.random() - 0.5) * magnitude,
    });

    stepWorld(dt);
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Returns the current spatial state of the single capsule in the format
 * expected by updateSignallingCircuit().
 *
 * The angle is converted from radians (Rapier internal) to multiples of π
 * (codebase convention used by dataProcessor.js and capsulePool.js).
 *
 * @returns {Array<{ id: string, x: number, y: number, angle: number, longAxis: number }>}
 */
export function getBacteriaSnapshot() {
    const { x, y, angle } = getBodyState();
    return [{
        id: _config.id,
        x,
        y,
        angle: angle / Math.PI,
        longAxis: _longAxis,
    }];
}

// ── Destroy ───────────────────────────────────────────────────────────────────

/**
 * Frees all Rapier resources and resets module state.
 * Safe to call even if init() was never called.
 */
export function destroy() {
    destroyWorld();
    _config = null;
    _longAxis = 0;
}
