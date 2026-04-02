/**
 * bacteriumBody.js
 *
 * Low-level helpers for creating, growing, and dividing individual bacterium
 * rigid bodies inside the Rapier2D world.
 *
 * Each rod-shaped bacterium is modelled as a dynamic rigid body with a single
 * capsule collider whose half-height grows over time. When the total length
 * (2 * radius + 2 * halfHeight) exceeds the division threshold, the body is
 * removed and replaced by two daughter bodies placed symmetrically along the
 * parent's long axis.
 *
 * Coordinate convention (matches the existing signalling layer):
 *   - x, y in µm, origin at the centre of the simulation domain
 *   - angle in units of π radians (i.e. angle=0.5 → 90°), matching the
 *     convention used in dataProcessor.js and capsulePool.js
 *   - longAxis in µm (total length of the capsule, tip-to-tip)
 *
 * All functions receive the Rapier `World` and `RAPIER` namespace as arguments
 * so this module stays stateless and easy to unit-test.
 */

// ── ID generation ─────────────────────────────────────────────────────────────

let _nextId = 1;

/**
 * Resets the internal ID counter to 1.
 * Call this when the physics world is re-initialised so IDs stay consistent.
 */
export function resetIdCounter() {
    _nextId = 1;
}

/**
 * Sets the internal ID counter to an explicit value.
 * Use this to seed the counter above the highest existing bacterium ID so that
 * newly born daughter cells never collide with seed bacteria IDs.
 *
 * @param {number} n - The next ID that will be returned by nextBacteriumId().
 */
export function setIdCounter(n) {
    _nextId = n;
}

/**
 * Returns a fresh, unique integer ID for a new bacterium.
 * @returns {number}
 */
export function nextBacteriumId() {
    return _nextId++;
}

// ── Body creation ─────────────────────────────────────────────────────────────

/**
 * Creates a dynamic rigid body + capsule collider for a single bacterium and
 * adds both to the Rapier world.
 *
 * The capsule is oriented along the Y-axis by default in Rapier; we apply the
 * bacterium's angle as the body's initial rotation.
 *
 * @param {RAPIER.World}  world         - The Rapier world instance.
 * @param {typeof RAPIER} RAPIER        - The Rapier namespace (for descriptors).
 * @param {object}        bacterium     - Seed data: { id, x, y, angle, longAxis }
 * @param {object}        physicsParams - { BACTERIUM_RADIUS, ... }
 * @returns {{ rigidBodyHandle: number, colliderHandle: number, longAxis: number }}
 */
export function createCapsuleBody(world, RAPIER, bacterium, physicsParams) {
    const { x, y, angle, longAxis } = bacterium;
    const radius = physicsParams.BACTERIUM_RADIUS;

    // halfHeight of the cylindrical section: longAxis = 2*radius + 2*halfHeight
    const halfHeight = Math.max(0, (longAxis - 2 * radius) / 2);

    // ── Rigid body ──────────────────────────────────────────────────────────
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        // angle is stored as multiples of π in the existing codebase
        .setRotation(angle * Math.PI)
        // Damping prevents unrealistic drift between physics steps
        .setLinearDamping(5.0)
        .setAngularDamping(5.0);

    const rigidBody = world.createRigidBody(bodyDesc);

    // ── Collider ────────────────────────────────────────────────────────────
    // Rapier's capsule collider: halfHeight is the half-length of the
    // cylindrical section; radius is the end-cap radius.
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
        .setRestitution(0.0)
        .setFriction(0.5);

    const collider = world.createCollider(colliderDesc, rigidBody);

    return {
        rigidBodyHandle: rigidBody.handle,
        colliderHandle: collider.handle,
        longAxis,
    };
}

// ── Growth ────────────────────────────────────────────────────────────────────

/**
 * Elongates a bacterium's capsule collider by `growthRate * dt` µm.
 *
 * Rapier does not support in-place collider resizing, so we remove the old
 * collider and attach a new one with the updated half-height to the same body.
 *
 * @param {RAPIER.World}  world           - The Rapier world instance.
 * @param {typeof RAPIER} RAPIER          - The Rapier namespace.
 * @param {number}        rigidBodyHandle - Handle of the body to grow.
 * @param {number}        currentLongAxis - Current total length in µm.
 * @param {number}        growthRate      - Elongation rate in µm/s.
 * @param {number}        dt              - Time step in seconds.
 * @param {object}        physicsParams   - { BACTERIUM_RADIUS, ... }
 * @returns {number} The updated longAxis value.
 */
export function growBody(world, RAPIER, rigidBodyHandle, currentLongAxis, growthRate, dt, physicsParams) {
    const radius = physicsParams.BACTERIUM_RADIUS;
    const newLongAxis = currentLongAxis + growthRate * dt;
    const newHalfHeight = Math.max(0, (newLongAxis - 2 * radius) / 2);

    const rigidBody = world.getRigidBody(rigidBodyHandle);
    if (!rigidBody) return currentLongAxis; // body was already removed

    // Remove all existing colliders attached to this body
    const numColliders = rigidBody.numColliders();
    for (let i = numColliders - 1; i >= 0; i--) {
        const col = rigidBody.collider(i);
        world.removeCollider(col, false /* wake = false */);
    }

    // Attach a new capsule collider with the updated dimensions
    const colliderDesc = RAPIER.ColliderDesc.capsule(newHalfHeight, radius)
        .setRestitution(0.0)
        .setFriction(0.5);

    world.createCollider(colliderDesc, rigidBody);

    return newLongAxis;
}

// ── Division ──────────────────────────────────────────────────────────────────

/**
 * Divides a bacterium into two daughter cells.
 *
 * The parent body is removed from the world. Two new bodies are created at
 * ±(longAxis / 4) along the parent's long axis, each with half the parent's
 * longAxis (minus a small gap to avoid immediate overlap).
 *
 * @param {RAPIER.World}  world           - The Rapier world instance.
 * @param {typeof RAPIER} RAPIER          - The Rapier namespace.
 * @param {number}        rigidBodyHandle - Handle of the dividing body.
 * @param {number}        parentLongAxis  - Total length of the parent in µm.
 * @param {object}        physicsParams   - { BACTERIUM_RADIUS, ... }
 * @returns {Array<{ id: number, rigidBodyHandle: number, colliderHandle: number, longAxis: number }>}
 *   Two entries, one per daughter cell.
 */
export function divideBody(world, RAPIER, rigidBodyHandle, parentLongAxis, physicsParams) {
    const rigidBody = world.getRigidBody(rigidBodyHandle);
    if (!rigidBody) return [];

    const pos = rigidBody.translation();
    const rot = rigidBody.rotation(); // radians

    // Daughter length: half the parent, minus a small separation gap
    const SEPARATION_GAP = physicsParams.BACTERIUM_RADIUS * 0.1;
    const daughterLongAxis = parentLongAxis / 2 - SEPARATION_GAP;

    // Offset each daughter along the parent's long axis (Y-axis rotated by rot)
    const offset = parentLongAxis / 4;
    const dx = -Math.sin(rot) * offset; // Rapier capsule aligned along Y
    const dy =  Math.cos(rot) * offset;

    // Remove the parent body (and its colliders) from the world
    world.removeRigidBody(rigidBody);

    // Create two daughter bodies
    const daughters = [];
    const offsets = [{ x: dx, y: dy }, { x: -dx, y: -dy }];

    for (const off of offsets) {
        const id = nextBacteriumId();
        const daughterBacterium = {
            id,
            x: pos.x + off.x,
            y: pos.y + off.y,
            // Convert back to the π-radians convention used by the rest of the codebase
            angle: rot / Math.PI,
            longAxis: daughterLongAxis,
        };
        const entry = createCapsuleBody(world, RAPIER, daughterBacterium, physicsParams);
        daughters.push({ id, ...entry });
    }

    return daughters;
}

// ── Snapshot extraction ───────────────────────────────────────────────────────

/**
 * Reads the current transform of a rigid body and returns a snapshot object
 * in the shape expected by `updateSignallingCircuit()`.
 *
 * @param {RAPIER.World} world           - The Rapier world instance.
 * @param {number}       rigidBodyHandle - Handle of the body to read.
 * @param {number}       id              - Bacterium ID.
 * @param {number}       longAxis        - Current total length in µm (tracked externally).
 * @returns {{ id: number, x: number, y: number, angle: number, longAxis: number } | null}
 *   Returns null if the body no longer exists in the world.
 */
export function getBodySnapshot(world, rigidBodyHandle, id, longAxis) {
    const rigidBody = world.getRigidBody(rigidBodyHandle);
    if (!rigidBody) return null;

    const pos = rigidBody.translation();
    const rot = rigidBody.rotation(); // radians

    return {
        id,
        x: pos.x,
        y: pos.y,
        // Convert from radians back to the π-radians convention
        angle: rot / Math.PI,
        longAxis,
    };
}
