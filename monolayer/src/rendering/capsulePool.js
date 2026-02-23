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
    
    // Create capsule objects until we reach the desired pool size
    while (capsules.length < poolSize) {
        const capsuleGeometry = new THREE.CapsuleGeometry();
        const capsuleMaterial = new THREE.MeshBasicMaterial();
        capsuleMaterial.transparent = true;
        
        const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
        
        // Add wireframe outline to capsule
        const wireframeGeometry = new THREE.EdgesGeometry(capsuleGeometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({});
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        
        capsule.add(wireframe);
        capsules.push(capsule);
    }

    // Add all capsules to the scene
    capsules.forEach(capsule => {
        stage.scene.add(capsule);
    });

    // Initialize geometry caches for different capsule sizes
    populateMapCaches(BACTERIUM, THREE, capsuleGeometryCache, edgesGeometryCache);
    
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
   
        const threePosition = new THREE.Vector3(x, y, 0);
       
        capsule.position.set(threePosition.x, threePosition.y, 0);
        capsule.rotation.z = angle * Math.PI;  
        updateCapsuleGeometry(capsule, longAxis);
        updateCapsuleColor(capsule, THREE, cytoplasmConcentrations);
       
        capsule.visible = true;
    });
} 

let PCAmins = [0, 0, 0];
let PCAmaxs = [0, 0, 0];
export function resetPCAs() {
    PCAmins = [0, 0, 0];
    PCAmaxs = [0, 0, 0];
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
        return [vals[0] , vals[1] , vals[2] ]; // collect the first three species
    });

    //allPCA is an array of arrays: [[b1_x, b1_y, b1_z], [b2_x, b2_y, b2_z], ...]
    // We need to find the min and max for each axis to normalize later

    const newPCAmins = [0, 1, 2].map(i => Math.min(...allPCA.map(p => p[i]))); // i is the index for x, y, z. p is the index for each bacterium
    const newPCAmaxs = [0, 1, 2].map(i => Math.max(...allPCA.map(p => p[i])));

    for (let i = 0; i < 3; i++) {
        PCAmins[i] = Math.min(PCAmins[i], newPCAmins[i]);
        PCAmaxs[i] = Math.max(PCAmaxs[i], newPCAmaxs[i]);
    }

    // Update and show capsules for each bacterium
    bacteriaData.forEach((bacterium, idx) => {
        const capsule = capsules[activeCount++];
   
        const { angle, longAxis, cytoplasmConcentrations } = bacterium;

        const raw = allPCA[idx];

        // Normalize each axis to [0, 1]; if range is zero, place at 0.5
        const xPCA = PCAmaxs[0] !== PCAmins[0] ? (raw[0] - PCAmins[0]) / (PCAmaxs[0] - PCAmins[0]) : 0.5;
        const yPCA = PCAmaxs[1] !== PCAmins[1] ? (raw[1] - PCAmins[1]) / (PCAmaxs[1] - PCAmins[1]) : 0.5;
        const zPCA = PCAmaxs[2] !== PCAmins[2] ? (raw[2] - PCAmins[2]) / (PCAmaxs[2] - PCAmins[2]) : 0.5;
   
        capsule.position.set(xPCA, yPCA, zPCA);
        capsule.scale.set(capsuleScale, capsuleScale, capsuleScale);
        capsule.rotation.z = 0;  
        updateCapsuleGeometry(capsule, longAxis);
        updateCapsuleColor(capsule, THREE, cytoplasmConcentrations);
       
        capsule.visible = true;
    });

  

  
} 


/**
 * Updates the geometry of a capsule based on its required length
 * 
 * @param {THREE.Mesh} capsule - The capsule mesh to update
 * @param {number} longAxis - The length value to determine which geometry to use
 */
function updateCapsuleGeometry(capsule, longAxis) {
    // Get cached geometry for this length
    let newGeometry = capsuleGeometryCache.get(longAxis);
    let newWireframeGeometry = edgesGeometryCache.get(longAxis);

    // Update geometry if different from current
    if (capsule.geometry !== newGeometry) {
        capsule.geometry.dispose();
        capsule.geometry = newGeometry;

        const wireframe = capsule.children[0];
        wireframe.geometry.dispose();
        wireframe.geometry = newWireframeGeometry;
    }
}
