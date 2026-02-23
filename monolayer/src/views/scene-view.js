/**
 * scene-view.js — 3D Scene dashboard window.
 *
 * Receives bacteria positions from the SharedWorker and renders them
 * using Three.js capsule pool + surface mesh (unchanged scene components).
 */

import { connectToWorker } from '../lib/worker-client.js';
import { THREE, OrbitControls } from '../rendering/vendor.js';
import { setupStage } from '../rendering/stage.js';
import { setupCapsulePool, updateCapsules, setBacterialColor } from '../rendering/capsulePool.js';
import { setupMesh, updateSurfaceMesh } from '../rendering/mesh.js';
import { CONFIG } from '../config.js';

export function mountSceneView(workerName) {
    let stage = {};
    let capsules = [];
    let mesh = null;
    let latestBacteria = null;
    let latestConcentration = null;
    let ready = false;

    // Visualization settings (controlled by controller's Visualization tab)
    let capsuleVisibility = true;
    let meshScale = 60;
    let meshTranslationZ = 0;
    let colorMultiplier = 100;
    let helperGrid = null;
    let helperAxes = null;

    // ── Worker connection ──
    connectToWorker(
        ['state:init', 'state:bacteria', 'state:concentrations', 'state:coloringRule', 'state:viz'],
        onMessage,
        workerName
    );

    function onMessage(msg) {
        switch (msg.type) {
            case 'state:init':
                setupScene(msg.data);
                break;

            case 'state:bacteria':
                latestBacteria = msg.data;
                break;

            case 'state:concentrations':
                latestConcentration = msg.data;
                break;

            case 'state:coloringRule':
                applyColoringRule(msg.data);
                break;

            case 'state:viz':
                handleVizCommand(msg.data);
                break;
        }
    }

    // ── Scene setup (runs once on state:init) ── 
    function setupScene(initData) {
        const SCENE     = CONFIG.SCENE;
        const BACTERIUM = CONFIG.BACTERIUM;
        const GRID      = CONFIG.GRID;

        stage    = setupStage(SCENE, THREE, OrbitControls, stage, mesh, capsules);
        capsules = setupCapsulePool(stage, BACTERIUM, THREE, capsules);
        mesh     = setupMesh(stage, THREE, GRID);

        // Helpers
        helperAxes = new THREE.AxesHelper(100);
        helperGrid = new THREE.GridHelper(200, 200, 0xFFFFFF, 0xFFFFFF);
        helperGrid.material.transparent = true;
        helperGrid.material.opacity = 0.50;
        helperGrid.rotation.x = Math.PI / 2;
        helperGrid.visible = false;
        helperAxes.visible = false;
        stage.scene.add(helperAxes);
        stage.scene.add(helperGrid);

        // Set fog
        stage.scene.fog = new THREE.Fog(SCENE.FOG_COLOR, SCENE.FOG_NEAR, SCENE.FOG_FAR);

        // Apply initial coloring rule
        if (initData.coloringRule) {
            applyColoringRule(initData.coloringRule);
        }

        ready = true;
    }

    function applyColoringRule(rule) {
        Object.entries(rule).forEach(([species, color]) => {
            setBacterialColor(species, color);
        });
        updateCapsules(latestBacteria, THREE, capsules, capsuleVisibility);

    }

    function handleVizCommand(data) {
        if (!ready) return;
        const { action, value } = data;

        switch (action) {
            case 'setMeshVisible':
                if (mesh) mesh.visible = value;
                updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);

                break;
            case 'selectSpecies':
                // Species selection is handled by the worker for concentration publishing
                break;
            case 'setCapsuleVisibility':
                capsuleVisibility = value;
                if (latestBacteria) {
                    updateCapsules(latestBacteria, THREE, capsules, capsuleVisibility);
                }
                break;
            case 'visibleGridAndAxes':
                if (helperGrid) helperGrid.visible = value;
                if (helperAxes) helperAxes.visible = value;
                break;
            case 'setMeshScale':
                meshScale = value;
                updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);

                break;
            case 'translateMesh':
                meshTranslationZ = value;
                updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);
                break;
            case 'setColorMultiplier':
                colorMultiplier = value;
                updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);
                break;
        }
    }

    // ── Render loop ──
    function animate() {
        requestAnimationFrame(animate);
        if (!ready) return;

        if (latestBacteria) {
            updateCapsules(latestBacteria, THREE, capsules, capsuleVisibility);
            //latestBacteria = null; // consume
        }

        if (latestConcentration && mesh && mesh.visible) {
            updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);
            //latestConcentration = null; // consume
        }

        stage.renderer.render(stage.scene, stage.camera);
    }

    animate();
}
