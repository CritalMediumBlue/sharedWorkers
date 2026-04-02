/**
 * physicsWorld.js
 *
 * Manages the Rapier2D world lifecycle for a minimal single-capsule simulation.
 *
 * Responsibilities:
 *   - Initialise the Rapier WASM module (once, lazily)
 *   - Create and own the Rapier `World` instance (zero gravity — 2D monolayer)
 *   - Create a single capsule rigid body from the provided configuration
 *   - Step the world and read back the body's current transform
 *   - Tear down all Rapier resources on destroy()
 *
 * This module handles all direct Rapier API calls. It is only imported by
 * physicsManager.js, which translates the raw body state into the
 * { id, x, y, angle, longAxis } format consumed by the signalling layer.
 *
 * Usage:
 *   import { init, step, getBodyState, destroy } from './physicsWorld.js';
 *
 *   await init({ x: 0, y: 0, angle: 0, halfLength: 1.5, radius: 0.5 });
 *   step(0.01);
 *   const { x, y, angle } = getBodyState();
 *   destroy();
 */

import RAPIER from '@dimforge/rapier2d-compat';

// ── Module state ─────────────────────────────────────────────────────────────

/** @type {RAPIER.World | null} */
let world = null;

/** @type {RAPIER.RigidBody | null} */
let rigidBody = null;

/** @type {boolean} Whether the Rapier WASM module has been initialised */
let rapierReady = false;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Initialises the Rapier WASM module, creates a zero-gravity 2D world, and
 * adds a single capsule rigid body described by `config`.
 *
 * Safe to call multiple times — tears down any previous world first.
 *
 * @param {{ x: number, y: number, angle: number, halfLength: number, radius: number }} config
 *   - x, y:        initial position (µm)
 *   - angle:        initial orientation (radians)
 *   - halfLength:   half-height of the capsule's cylindrical section (µm)
 *   - radius:       capsule end-cap radius (µm)
 * @returns {Promise<void>}
 */
export async function init(config) {
    if (!rapierReady) {
        // The -compat variant inlines the WASM binary as base64, so this
        // resolves synchronously in practice but the API is still async.
        await RAPIER.init();
        rapierReady = true;
    }

    // Tear down any pre-existing world before creating a new one
    if (world !== null) {
        world.free();
        world = null;
        rigidBody = null;
    }

    // Zero gravity — bacteria are constrained to the 2D monolayer plane
    world = new RAPIER.World({ x: 0.0, y: 0.0 });

    // ── Rigid body ──────────────────────────────────────────────────────────
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(config.x, config.y)
        .setRotation(config.angle)
        .setLinearDamping(5.0)
        .setAngularDamping(5.0);

    rigidBody = world.createRigidBody(bodyDesc);

    // ── Capsule collider ────────────────────────────────────────────────────
    // halfLength = half-height of the cylindrical section
    // radius     = end-cap radius
    // Total tip-to-tip length = 2 * halfLength + 2 * radius
    const colliderDesc = RAPIER.ColliderDesc.capsule(config.halfLength, config.radius)
        .setRestitution(0.0)
        .setFriction(0.5);

    world.createCollider(colliderDesc, rigidBody);
}

/**
 * Advances the physics world by one time step.
 *
 * @param {number} dt - Time step in seconds.
 */
export function step(dt) {
    if (!world) throw new Error('physicsWorld: not initialised. Call init() first.');
    if (dt !== undefined) {
        world.timestep = dt;
    }
    world.step();
}

/**
 * Reads the current translation and rotation of the capsule body.
 *
 * @returns {{ x: number, y: number, angle: number }}
 *   - x, y:   position in µm
 *   - angle:  orientation in radians
 */
export function getBodyState() {
    if (!rigidBody) throw new Error('physicsWorld: not initialised. Call init() first.');
    const pos = rigidBody.translation();
    const rot = rigidBody.rotation();
    return { x: pos.x, y: pos.y, angle: rot };
}

/**
 * Frees all Rapier resources and resets module state.
 * Safe to call even if init() was never called.
 */
export function destroy() {
    rigidBody = null;
    if (world !== null) {
        world.free();
        world = null;
    }
}

/**
 * Applies a 2D force vector to the capsule's center of mass.
 * The force is applied for the duration of the next world.step() call.
 *
 * @param {{ x: number, y: number }} force
 */
export function applyForce(force) {
    if (!rigidBody) throw new Error('physicsWorld: not initialised.');
    rigidBody.addForce(force, true); // true = wake the body
}
