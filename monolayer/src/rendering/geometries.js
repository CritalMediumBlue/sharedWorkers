/**
 * @module geometries
 * @description Handles the creation and management of geometries and related visual aspects
 * for bacteria representation in the 3D scene.
 */

const coloringRule = {};

export const setBacterialColor = (species, color) => {
    coloringRule[species] = color;
};

// Colour channel 0–255 as three.js parses it from a CSS rgb() string:
// rounded to an integer and capped at 255 (and at 0 below)
const channel = (value) => Math.min(255, Math.max(0, Math.round(value))) / 255;

// Scratch values reused for every cell, so that colouring allocates nothing
const rgba = { r: 0, g: 0, b: 0, alpha: 0 };

const getColor = (cytoplasmicconcentrations) => {
    let newRed = 0;
    let newGreen = 0;
    let newBlue = 0;
    let newAlpha = 0;
    for (const species in cytoplasmicconcentrations) {
        const rule = coloringRule[species];
        const weight = cytoplasmicconcentrations[species] * rule.intensity;
        newRed   += rule.r * weight;
        newGreen += rule.g * weight;
        newBlue  += rule.b * weight;
        newAlpha += rule.a * weight;
    }
    rgba.r = channel(newRed);
    rgba.g = channel(newGreen);
    rgba.b = channel(newBlue);
    rgba.alpha = newAlpha / 2;
    return rgba;
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
export function updateCapsuleColor(capsule, THREE, cytoplasmConcentrations) {
    const { r, g, b, alpha } = getColor(cytoplasmConcentrations);
    // Same colour as parsing `rgb(…)` (sRGB input), without building and parsing a string
    capsule.material.color.setRGB(r, g, b, THREE.SRGBColorSpace);
    capsule.material.opacity = alpha;
    capsule.children[0].material.color.copy(capsule.material.color).multiplyScalar(0.1);
    capsule.renderOrder = 0;
}
