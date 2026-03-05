/**
 * stage.js — Sets up the Three.js scene, camera, renderer, and orbit controls.
 * Manages the lifecycle of these components including creation, configuration, and disposal.
 */

/**
 * Sets up a complete Three.js stage with scene, camera, and renderer
 * @param {Object} SCENE - Configuration object containing scene settings
 * @param {Object} THREE - Three.js library instance
 * @param {Function} OrbitControls - Three.js OrbitControls class constructor
 * @param {Object} stage - The stage object to update or clear
 * @param {Object} [mesh] - Optional mesh to clear when resetting
 * @param {Array} [capsules] - Optional array of capsule objects to clear when resetting
 * @returns {Object} Updated stage object { scene, camera, renderer }
 */
export function setupStage(SCENE, THREE, OrbitControls, stage, mesh, capsules) {
    if (stage && Object.keys(stage).length > 0) {
        clearStage(stage, mesh, capsules);
    }

    stage.scene    = new THREE.Scene();
    stage.renderer = createRenderer(THREE);
    stage.camera   = createCamera(SCENE, THREE, OrbitControls, stage.renderer.domElement);

    Object.seal(stage);
    Object.preventExtensions(stage);

    return stage;
}

// ─── Renderer ───────────────────────────────────────────────────────────────

function createRenderer(THREE, ratio = 1) { //ratio 
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
    });

    renderer.setSize(window.innerWidth * ratio, window.innerHeight * ratio, false);

    renderer.domElement.style.width   = '100vw';
    renderer.domElement.style.height  = '100vh';
    renderer.domElement.style.display = 'block';

    document.body.appendChild(renderer.domElement);

    return renderer;
}

// ─── Camera + Controls ──────────────────────────────────────────────────────

function createCamera(SCENE, THREE, OrbitControlsClass, domElement) {
    const camera = new THREE.PerspectiveCamera(
        SCENE.CAMERA_FOV,
        window.innerWidth / window.innerHeight,
        SCENE.CAMERA_NEAR,
        SCENE.CAMERA_FAR,
    );

    camera.position.set(
        SCENE.CAMERA_POSITION.x,
        SCENE.CAMERA_POSITION.y,
        SCENE.CAMERA_POSITION.z,
    );

    camera.lookAt(
        SCENE.CAMERA_LOOKAT.x,
        SCENE.CAMERA_LOOKAT.y,
        SCENE.CAMERA_LOOKAT.z,
    );

    camera.controls = createControls(camera, domElement, SCENE, OrbitControlsClass);

    return camera;
}

function createControls(camera, domElement, SCENE, OrbitControlsClass) {
    const controls = new OrbitControlsClass(camera, domElement);

    controls.enableDamping     = false;
    controls.autoRotate        = false;
    controls.screenSpacePanning = true;

    controls.maxDistance = SCENE.CONTROLS_MAX_DISTANCE;
    controls.minDistance = SCENE.CONTROLS_MIN_DISTANCE;

    controls.target.set(
        SCENE.CAMERA_LOOKAT.x,
        SCENE.CAMERA_LOOKAT.y,
        SCENE.CAMERA_LOOKAT.z,
    );

    return controls;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function clearStage(stage, mesh, capsules) {
    if (mesh) {
        stage.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh = null;
    }

    if (capsules) {
        capsules.forEach(capsule => {
            stage.scene.remove(capsule);
            capsule.geometry.dispose();
            capsule.material.dispose();
        });
        capsules = [];
    }

    if (stage.renderer?.domElement?.parentNode) {
        stage.renderer.domElement.parentNode.removeChild(stage.renderer.domElement);
        stage.renderer.dispose();
    }

    stage.camera   = null;
    stage.scene    = null;
    stage.renderer = null;
}
