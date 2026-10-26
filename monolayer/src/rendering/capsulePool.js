import { populateMapCaches, updateCapsuleColor, setBacterialColor } from './geometries.js';
export { setBacterialColor }

/**
 * @module capsulePool
 * @description Manages the creation and initialization of a pool of 3D capsule objects 
 * that represent bacteria in the scene. This module provides functionality to set up
 * a predetermined number of bacteria capsule meshes with wireframes.
 */

// Caches to store pre-generated geometries for performance optimization
const capsuleGeometryCache = new Map();
const edgesGeometryCache = new Map();

/**
 * Creates and initializes a pool of bacteria capsule meshes in the 3D scene
 * 
 * @param {Object} stage - The stage object containing the scene where capsules will be added
 * @param {Object} THREE - The Three.js library object needed for creating 3D objects
 * @param {Array<THREE.Mesh>} capsules - Existing array of capsule objects to be populated
 * @returns {Array<THREE.Mesh>} The array of capsule meshes that was populated
 */
export function setupCapsulePool(stage, BACTERIUM, THREE, capsules) {
    const poolSize = BACTERIUM.INITIAL_POOL_SIZE*2;

    // Geometry caches for the different capsule lengths, shared by all capsules
    if (capsuleGeometryCache.size === 0) {
        populateMapCaches(BACTERIUM, THREE, capsuleGeometryCache, edgesGeometryCache);
    }

    // Create capsule objects until we reach the desired pool size. They start with
    // the shared geometry of the shortest length (no per-capsule geometry to build
    // and throw away); only the materials are per capsule, for the per-cell colour.
    while (capsules.length < poolSize) {
        const capsuleMaterial = new THREE.MeshBasicMaterial();
        capsuleMaterial.transparent = true;
        const capsule = new THREE.Mesh(capsuleGeometryCache.get(1), capsuleMaterial);

        // Add wireframe outline to capsule
        const wireframeMaterial = new THREE.LineBasicMaterial({});
        const wireframe = new THREE.LineSegments(edgesGeometryCache.get(1), wireframeMaterial);

        capsule.add(wireframe);
        capsules.push(capsule);
    }

    // Add all capsules to the scene
    capsules.forEach(capsule => {
        stage.scene.add(capsule);
    });

    return capsules;
}

/**
 * Updates the properties of capsule objects based on bacteria simulation data
 * 
 * @param {Array<Object>} bacteriaData - Array of bacteria data objects from simulation
 * @param {Object} THREE - The Three.js library object
 * @param {Array<THREE.Mesh>} capsules - Array of capsule mesh objects to update
 */
export function updateCapsules(bacteriaData, THREE, capsules, capsuleVisibility) {

    // Reset active count and hide all capsules
    let activeCount = 0;
    capsules.forEach(capsule => {
        capsule.visible = false;
    });

    if (!bacteriaData || bacteriaData.length === 0 || capsuleVisibility === false) {
        return;
    }
    
   
    // Update and show capsules for each bacterium
    bacteriaData.forEach(bacterium => {
        const capsule = capsules[activeCount++];
   
        const { x, y, 
            angle, 
            longAxis, 
            cytoplasmConcentrations } = bacterium;
   
        capsule.position.set(x, y, 0);
        capsule.rotation.z = angle * Math.PI;  
        updateCapsuleGeometry(capsule, longAxis);
        updateCapsuleColor(capsule, THREE, cytoplasmConcentrations);
       
        capsule.visible = true;
    });
} 

// Minimum is always 0 (concentrations are non-negative), so we only track the max.
let PCAmaxs = [0, 0, 0];

export function resetPCAs() {
    PCAmaxs = [0, 0, 0];
}

// Stores the previous normalized phase-space position for each bacterium by ID.
// Used to compute the displacement vector for capsule orientation.
const previousPCAPositions = new Map(); // bacteriumId → { x, y, z }

export function resetPCAPositions() {
    previousPCAPositions.clear();
}

export function updateCapsulesPCA(bacteriaData, THREE, capsules, capsuleVisibility, capsuleScale ) {

    // Reset active count and hide all capsules
    let activeCount = 0;
    capsules.forEach(capsule => {
        capsule.visible = false;
    });

    if (!bacteriaData || bacteriaData.length === 0 || capsuleVisibility === false) {
        return;
    }

    // Collect all PCA values per axis across all bacteria
    const allPCA = bacteriaData.map(b => {
        const vals = Object.values(b.cytoplasmConcentrations);
        return [vals[0], vals[1], vals[2]]; // collect the first three species
    });

    // Update running maximums (min is always 0)
    const newPCAmaxs = [0, 1, 2].map(i => Math.max(...allPCA.map(p => p[i])));
    for (let i = 0; i < 3; i++) {
        PCAmaxs[i] = Math.max(PCAmaxs[i], newPCAmaxs[i]);
    }

    // Default orientation axis: CapsuleGeometry is aligned along Y by default
    const yAxis = new THREE.Vector3(0, 1, 0);

    // Update and show capsules for each bacterium
    bacteriaData.forEach((bacterium, idx) => {
        const capsule = capsules[activeCount++];
   
        const { id, longAxis, cytoplasmConcentrations } = bacterium;

        const raw = allPCA[idx];

        // Normalize each axis to [0, 1]; min is always 0, so divide by max.
        // If max is 0, place at 0 (no signal).
        const xPCA = PCAmaxs[0] > 0 ? raw[0] / PCAmaxs[0] : 0;
        const yPCA = PCAmaxs[1] > 0 ? raw[1] / PCAmaxs[1] : 0;
        const zPCA = PCAmaxs[2] > 0 ? raw[2] / PCAmaxs[2] : 0;
   
        capsule.position.set(xPCA, yPCA, zPCA);
        capsule.scale.set(capsuleScale, capsuleScale, capsuleScale);

        // Compute orientation from displacement in phase space
        const prev = previousPCAPositions.get(id);
        if (prev) {
            const dx = xPCA - prev.x;
            const dy = yPCA - prev.y;
            const dz = zPCA - prev.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len > 1e-9) {
                const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
                capsule.quaternion.setFromUnitVectors(yAxis, dir);
            }
            // If displacement is negligible, keep the previous quaternion (no jitter)
        } else {
            // New bacterium: use mother cell's previous position to estimate initial direction
            const motherId = bacterium.parentId;
            if (motherId !== null && motherId !== undefined) {
                const motherPrev = previousPCAPositions.get(motherId);
                if (motherPrev) {
                    const dx = xPCA - motherPrev.x;
                    const dy = yPCA - motherPrev.y;
                    const dz = zPCA - motherPrev.z;
                    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (len > 1e-9) {
                        const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
                        capsule.quaternion.setFromUnitVectors(yAxis, dir);
                    }
                }
            }
        }
        // Store current normalized position for next frame
        previousPCAPositions.set(id, { x: xPCA, y: yPCA, z: zPCA });

        updateCapsuleGeometry(capsule, longAxis);
        updateCapsuleColor(capsule, THREE, cytoplasmConcentrations);
       
        capsule.visible = true;
    });

    // Return only the maxs; mins are always [0, 0, 0]
    return PCAmaxs;
} 


/**
 * Updates the geometry of a capsule based on its required length
 * 
 * @param {THREE.Mesh} capsule - The capsule mesh to update
 * @param {number} longAxis - The length value to determine which geometry to use
 */
function updateCapsuleGeometry(capsule, longAxis) {
    // Cached geometries exist for the integer lengths 1–29
    const length = Math.min(29, Math.max(1, Math.round(longAxis)));
    const newGeometry = capsuleGeometryCache.get(length);

    // Swap to the shared geometry of this length. The geometries are shared by
    // all capsules, so they must not be disposed here: disposing would free GPU
    // buffers that other capsules still use and force a re-upload.
    if (capsule.geometry !== newGeometry) {
        capsule.geometry = newGeometry;
        capsule.children[0].geometry = edgesGeometryCache.get(length);
    }
}
