
import { connectToWorker } from '../lib/worker-client.js';
import { THREE, OrbitControls } from '../rendering/vendor.js';
import { setupStage } from '../rendering/stage.js';
import { setupCapsulePool, updateCapsulesPCA, setBacterialColor, resetPCAs } from '../rendering/capsulePool.js';
import { CONFIG } from '../config.js';

export function mountPhasePortraitView(workerName) {
    let spriteX_max = null;
    let spriteY_max = null;
    let spriteZ_max = null;
    let stage = {};
    let capsules = [];
    let latestBacteria = null;
    let ready = false;
    let xAxisName = '';
    let yAxisName = ''; 
    let zAxisName = '';
    let maxConcentrations; // Track max concentrations for axis scale labels

    // Visualization settings (controlled by controller's Visualization tab)
    let capsuleVisibility = true;
    let helperGridxy = null;
    let helperGridyz = null;
    let helperGridxz = null;
    let helperAxes = null;
    let updateScaleLabels = false; 


    // ── Worker connection ──
    connectToWorker(
        ['state:init', 'state:bacteria', 'state:coloringRule'],
        onMessage,
        workerName
    );

    function onMessage(msg) {
        switch (msg.type) {
            case 'state:init':
                setupScene(msg.data);
                resetPCAs(); // reset PCA maxs when a new simulation starts
                break;

            case 'state:bacteria':
                latestBacteria = msg.data;
                break;

            case 'state:coloringRule':
                applyColoringRule(msg.data);
                break;
        }
    }

    // ── Scene setup (runs once on state:init) ──
    function setupScene(initData) {
        const SCENE     = CONFIG.PHASE_PORTRAIT;
        const BACTERIUM = CONFIG.BACTERIUM;

        stage    = setupStage(SCENE, THREE, OrbitControls, stage, null, capsules);
        capsules = setupCapsulePool(stage, BACTERIUM, THREE, capsules);

        // Helpers
        helperAxes = new THREE.AxesHelper(1);
        helperGridxy = new THREE.GridHelper(1, 10, 0xFFFFFF, 0xFFFFFF);
        helperGridxy.position.x = 0.5;
        helperGridxy.position.y = 0.5;
        helperGridxy.material.transparent = true;
        helperGridxy.material.opacity = 0.25;
        helperGridxy.rotation.x = Math.PI / 2;
        helperGridxy.visible = true;
        helperGridyz = new THREE.GridHelper(1, 10, 0xFFFFFF, 0xFFFFFF);
        helperGridyz.position.y = 0.5;
        helperGridyz.position.z = 0.5;
        helperGridyz.material.transparent = true;
        helperGridyz.material.opacity = 0.25;
        helperGridyz.rotation.x = Math.PI / 2;
        helperGridyz.rotation.z = Math.PI / 2;
        helperGridyz.visible = true;
        helperGridxz = new THREE.GridHelper(1, 10, 0xFFFFFF, 0xFFFFFF);
        helperGridxz.position.x = 0.5;
        helperGridxz.position.z = 0.5;
        helperGridxz.material.transparent = true;
        helperGridxz.material.opacity = 0.25;
        helperGridxz.visible = true;
        helperAxes.visible = true;
        stage.scene.add(helperAxes);
        stage.scene.add(helperGridxy);
        stage.scene.add(helperGridyz);
        stage.scene.add(helperGridxz);

        // Set fog
        stage.scene.fog = new THREE.Fog(SCENE.FOG_COLOR, SCENE.FOG_NEAR, SCENE.FOG_FAR);

        // Apply initial coloring rule
        if (initData.coloringRule) {
            applyColoringRule(initData.coloringRule);
            xAxisName = initData.speciesNames?.[0] || 'Species 1'; 
            yAxisName = initData.speciesNames?.[1] || 'Species 2';
            zAxisName = initData.speciesNames?.[2] || 'Species 3';
        }

        // Axis name labels — placed just beyond the tip of each axis (axes go 0→1)
        const labelX = createAxisLabel(xAxisName, { x: 1.1, y: 0.05, z: 0.05 });
        const labelY = createAxisLabel(yAxisName, { x: 0.05, y: 1.1, z: 0.05 });
        const labelZ = createAxisLabel(zAxisName, { x: 0.05, y: 0,   z: 1.1  });
        stage.scene.add(labelX);
        stage.scene.add(labelY);
        stage.scene.add(labelZ);

        // Min labels are always 0
        const minLabel = createAxisLabel('0.00', { x: 0, y: 0, z: 0 });
        stage.scene.add(minLabel);
   
        ready = true;
    }

    function applyColoringRule(rule) {
        Object.entries(rule).forEach(([species, color]) => {
            setBacterialColor(species, color);
        });
        // Trigger a label refresh on next frame
        updateScaleLabels = true;
        updateCapsulesPCA(latestBacteria, THREE, capsules, capsuleVisibility, CONFIG.PHASE_PORTRAIT.CAPSULE_SCALE);
    }

    // ── Render loop ──
    function animate() {
        requestAnimationFrame(animate);
        if (!ready) return;

        if (latestBacteria) {
            const newMaxs = updateCapsulesPCA(latestBacteria, THREE, capsules, capsuleVisibility, CONFIG.PHASE_PORTRAIT.CAPSULE_SCALE);

            if (newMaxs) {
                // Detect if any max value has changed (value comparison)
                const changed = !maxConcentrations ||
                    newMaxs.some((v, i) => v !== maxConcentrations[i]);

                if (changed) {
                    maxConcentrations = newMaxs.slice();
                    updateScaleLabels = true;
                }
            }
        }

        if (updateScaleLabels && maxConcentrations) {
            updateAxesLabels(maxConcentrations);
            updateScaleLabels = false;
        }

        stage.renderer.render(stage.scene, stage.camera);
    }

    animate();

    function updateAxesLabels(maxConcentrations) {
        if (spriteX_max) stage.scene.remove(spriteX_max);
        if (spriteY_max) stage.scene.remove(spriteY_max);
        if (spriteZ_max) stage.scene.remove(spriteZ_max);

        spriteX_max = createAxisLabel(maxConcentrations[0].toFixed(2), { x: 1.00, y: 0, z: 0 });
        stage.scene.add(spriteX_max);

        spriteY_max = createAxisLabel(maxConcentrations[1].toFixed(2), { x: 0, y: 1.00, z: 0 });
        stage.scene.add(spriteY_max);

        spriteZ_max = createAxisLabel(maxConcentrations[2].toFixed(2), { x: 0, y: 0, z: 1.00 });
        stage.scene.add(spriteZ_max);
    }


    /**
     * Creates a billboard text label (Sprite) at the given position.
     * @param {string} text - The label text to display
     * @param {{x:number, y:number, z:number}} position - World position for the label
     * @returns {THREE.Sprite}
     */
    function createAxisLabel(text, position) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 50px sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
        const sprite = new THREE.Sprite(material);

        // Scale sprite to keep a reasonable aspect ratio in world space
        sprite.scale.set(0.25, 0.0625, 1);
        sprite.position.set(position.x, position.y, position.z);

        return sprite;
    }
}
