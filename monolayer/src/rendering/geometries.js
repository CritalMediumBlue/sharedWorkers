/**
 * @module geometries
 * @description Handles the creation and management of geometries and related visual aspects
 * for bacteria representation in the 3D scene.
 */

const coloringRule = {};

export const setBacterialColor = (species, color) => {
    coloringRule[species] = color;
};

const getColor = (cytoplasmicconcentrations) => {
    let newRed = 0;
    let newGreen = 0;
    let newBlue = 0;
    let newAlpha = 0;
    Object.keys(cytoplasmicconcentrations).forEach(species => {
        newRed   += coloringRule[species].r * cytoplasmicconcentrations[species] * coloringRule[species].intesity;
        newGreen += coloringRule[species].g * cytoplasmicconcentrations[species] * coloringRule[species].intesity;
        newBlue  += coloringRule[species].b * cytoplasmicconcentrations[species] * coloringRule[species].intesity;
        newAlpha += coloringRule[species].a * cytoplasmicconcentrations[species] * coloringRule[species].intesity;
    });

    return [`rgb(${Math.round(newRed)}, ${Math.round(newGreen)}, ${Math.round(newBlue)})`, newAlpha / 2];
};

/**
 * Populates geometry caches for different capsule lengths to avoid recreating geometries
 */
export function populateMapCaches(BACTERIUM, THREE, capsuleGeometryCache, edgesGeometryCache) {
    const capSeg    = BACTERIUM.CAP_SEGMENTS;
    const radialSeg = BACTERIUM.RADIAL_SEGMENTS;

    for (let length = 1; length < 30; length++) {
        const geometry = new THREE.CapsuleGeometry(0.5, length, capSeg, radialSeg);
        capsuleGeometryCache.set(length, geometry);

        const scaledGeometry = geometry.clone();
        scaledGeometry.scale(
            BACTERIUM.WIREFRAME_SCALE,
            BACTERIUM.WIREFRAME_SCALE,
            BACTERIUM.WIREFRAME_SCALE,
        );

        const wireframeGeometry = new THREE.EdgesGeometry(scaledGeometry);
        edgesGeometryCache.set(length, wireframeGeometry);
    }
}

/**
 * Updates the color of a capsule based on cytoplasm concentrations
 */
export function updateCapsuleColor(capsule, BACTERIUM, THREE, cytoplasmConcentrations) {
    if (BACTERIUM.COLOR_BY_INHERITANCE) {
        const color = getColor(cytoplasmConcentrations);
        const threeColor = new THREE.Color(color[0]);

        capsule.material.color.copy(threeColor);
        capsule.material.opacity = color[1];
        capsule.children[0].material.color.copy(threeColor.clone().multiplyScalar(0.1));
        capsule.renderOrder = 0;
    }
}
