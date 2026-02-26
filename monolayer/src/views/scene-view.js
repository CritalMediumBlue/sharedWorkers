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
import { setupMesh, updateSurfaceMesh, calculateColor } from '../rendering/mesh.js';
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

    // Scale bar state
    let scaleBarCanvas = null;
    let scaleBarCtx = null;
    let lastScaleBarMin = null;
    let lastScaleBarMax = null;
    let lastScaleBarColorMultiplier = null;

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

        // Create the HTML canvas scale bar overlay
        setupScaleBar();

        ready = true;
    }

    // ── Scale bar ──────────────────────────────────────────────────────────

    function setupScaleBar() {
        // Remove any existing scale bar (e.g. on re-init)
        if (scaleBarCanvas && scaleBarCanvas.parentNode) {
            scaleBarCanvas.parentNode.removeChild(scaleBarCanvas);
        }

        scaleBarCanvas = document.createElement('canvas');
        scaleBarCanvas.width  = 60;
        scaleBarCanvas.height = 220;
        scaleBarCanvas.style.position   = 'fixed';
        scaleBarCanvas.style.bottom     = '20px';
        scaleBarCanvas.style.right      = '20px';
        scaleBarCanvas.style.zIndex     = '10';
        scaleBarCanvas.style.display    = 'none'; // hidden until mesh is shown
        scaleBarCanvas.style.pointerEvents = 'none';
        document.body.appendChild(scaleBarCanvas);

        scaleBarCtx = scaleBarCanvas.getContext('2d');
    }

    /**
     * Draws the color scale bar with the given concentration range.
     * @param {number} minVal - Minimum concentration value
     * @param {number} maxVal - Maximum concentration value
     * @param {number} cm     - colorMultiplier used in the mesh shader
     */
    function drawScaleBar(minVal, maxVal, cm) {
        const ctx    = scaleBarCtx;
        const W      = scaleBarCanvas.width;   // 60
        const H      = scaleBarCanvas.height;  // 220
        const barX   = 0;   // left edge of the colour strip
        const barW   = 20;   // width of the colour strip
        const barTop = 20;   // top padding
        const barH   = H - 50; // height of the colour strip (leaves room for labels)

        ctx.clearRect(0, 0, W, H);

        // Draw the gradient strip pixel-row by pixel-row
        for (let py = 0; py < barH; py++) {
            // py=0 → maxVal, py=barH-1 → minVal  (top = high, bottom = low)
            const t = 1 - py / (barH - 1);
            const concentration = minVal + t * (maxVal - minVal);
            const { r, g, b } = calculateColor(concentration * cm);
            ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
            ctx.fillRect(barX, barTop + py, barW, 1);
        }

        // Border around the strip
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barTop, barW, barH);

        // Labels
        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';

        // Max label (top)
        ctx.fillText(maxVal.toFixed(4), barX + barW + 4, barTop + 6);

        // Mid label
        const midVal = (minVal + maxVal) / 2;
        ctx.fillText(midVal.toFixed(4), barX + barW + 4, barTop + barH / 2 + 4);

        // Min label (bottom)
        ctx.fillText(minVal.toFixed(4), barX + barW + 4, barTop + barH + 4);

        // Unit label below the bar
        ctx.textAlign = 'center';
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
    }

    // ── Coloring rule ──────────────────────────────────────────────────────

    function applyColoringRule(rule) {
        Object.entries(rule).forEach(([species, color]) => {
            setBacterialColor(species, color);
        });
        updateCapsules(latestBacteria, THREE, capsules, capsuleVisibility);
    }

    // ── Viz commands ───────────────────────────────────────────────────────

    function handleVizCommand(data) {
        if (!ready) return;
        const { action, value } = data;

        switch (action) {
            case 'setMeshVisible':
                if (mesh) mesh.visible = value;
                if (scaleBarCanvas) scaleBarCanvas.style.display = value ? 'block' : 'none';
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
                // Force scale bar redraw on next frame
                lastScaleBarColorMultiplier = null;
                updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);
                break;
        }
    }

    // ── Render loop ──────────────────────────────────────────────────────

    function animate() {
        requestAnimationFrame(animate);
        if (!ready) return;

        if (latestBacteria) {
            updateCapsules(latestBacteria, THREE, capsules, capsuleVisibility);
        }

        if (latestConcentration && mesh && mesh.visible) {
            updateSurfaceMesh(mesh, latestConcentration.conc, meshScale, meshTranslationZ, colorMultiplier);

            // Update scale bar only when the range or colorMultiplier changes
            const conc = latestConcentration.conc;
            let minVal = Infinity, maxVal = -Infinity;
            for (let i = 0; i < conc.length; i++) {
                if (conc[i] < minVal) minVal = conc[i];
                if (conc[i] > maxVal) maxVal = conc[i];
            }

            if (
                minVal !== lastScaleBarMin ||
                maxVal !== lastScaleBarMax ||
                colorMultiplier !== lastScaleBarColorMultiplier
            ) {
                lastScaleBarMin = minVal;
                lastScaleBarMax = maxVal;
                lastScaleBarColorMultiplier = colorMultiplier;
                drawScaleBar(minVal, maxVal, colorMultiplier);
            }
        }

        stage.renderer.render(stage.scene, stage.camera);
    }

    animate();
}
