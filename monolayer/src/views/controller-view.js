/**
 * controller-view.js — Controller window.
 *
 * Provides Tweakpane GUI for:
 *   • Loading data (.json) and equations (.js) files
 *   • Initializing / running / pausing / resetting the simulation
 *   • Adjusting ODE parameters via sliders
 *   • Opening dashboard windows (3D scene, plot, overlay)
 *
 * All simulation commands are sent to the SharedWorker.
 */

import { connectToWorker } from '../lib/worker-client.js';
import { Pane } from 'tweakpane';

export function mountControllerView() {
    // ── DOM setup ──
    const paneDiv = document.createElement('div');
    paneDiv.id = 'pane';
    document.body.appendChild(paneDiv);

    // ── Worker connection ──
    const { send } = connectToWorker(
        ['equations:loaded', 'data:loaded', 'state:finished', 'error'],
        onMessage,
    );

    // Close all dashboard windows and terminate the SharedWorker when the controller closes
    window.addEventListener('beforeunload', () => {
        openWindows.forEach(win => { if (!win.closed) win.close(); });
        openWindows.length = 0;
        send({ type: 'command:terminate' });
    });

    // ── State flags ──
    let dataLoaded = false;
    let equationsLoaded = false;

    // ── Tweakpane ──
    const pane = new Pane({ title: 'Simulation Controls', container: paneDiv });

    const tab = pane.addTab({
        pages: [
            { title: 'Session' },
            { title: 'Parameters' },
            { title: 'Visualization' },
            { title: 'Dashboards' },
        ],
    });

    // ── Session tab ──
    const sessionPage = tab.pages[0];

    const loadFolder = sessionPage.addFolder({ title: 'Load files' });
    const loadEqBtn   = loadFolder.addButton({ title: '📂', label: 'Load Equations' });
    const loadDataBtn = loadFolder.addButton({ title: '📂', label: 'Load State' });
    const statusText  = loadFolder.addBlade({
        view: 'text',
        label: 'status',
        parse: (v) => String(v),
        value: 'No files loaded',
    });

    sessionPage.addBlade({ view: 'separator' });

    const execFolder = sessionPage.addFolder({ title: 'Execution' });
    execFolder.disabled = true;

    const initBtn    = execFolder.addButton({ title: '🚀', label: 'Initialize' });
    const playBtn    = execFolder.addButton({ title: '▶/⏸', label: 'Run / Pause' });
    const resetBtn   = execFolder.addButton({ title: '↺',  label: 'Reset' });
    const stepBtn    = execFolder.addButton({ title: '⏭',  label: 'Step Forward' });

    // ── Parameters tab ──
    const paramsPage   = tab.pages[1];
    const paramsFolder = paramsPage.addFolder({ title: 'Parameters' });
    paramsFolder.disabled = true;

    // ── Visualization tab (populated after equations load) ──
    const vizPage = tab.pages[2];
    vizPage.disabled = true;

    // ── Dashboards tab ──
    const dashPage = tab.pages[3];
    const base = `${location.origin}${location.pathname}`;
    const openWindows = [];

    const open3dBtn      = dashPage.addButton({ title: '🖥️  3D Scene',  label: 'Open' });
    const openPlotBtn    = dashPage.addButton({ title: '📊  Plot',      label: 'Open' });
    const openOverlayBtn = dashPage.addButton({ title: '📋  Stats',     label: 'Open' });
    dashPage.addBlade({ view: 'separator' });
    const openAllBtn     = dashPage.addButton({ title: '🚀  Open All',  label: 'Open' });
    const closeAllBtn    = dashPage.addButton({ title: '🛑  Close All', label: 'Close' });

    // ── Event handlers ──

    // File loading
    loadEqBtn.on('click', () => {
        pickFile('.js', (text) => {
            send({ type: 'command:loadEquations', data: { text } });
            updateStatus();
        });
    });

    loadDataBtn.on('click', () => {
        pickFile('.json', (text) => {
            send({ type: 'command:loadData', data: { text } });
            updateStatus();
        });
    });

    // Execution
    initBtn.on('click',  () => send({ type: 'command:init' }));
    playBtn.on('click',  () => send({ type: 'command:toggle' }));
    resetBtn.on('click', () => send({ type: 'command:reset' }));
    stepBtn.on('click',  () => send({ type: 'command:stepForward' }));

    // Dashboard openers
    function openDashboard(url, name, features) {
        const win = window.open(url, name, features);
        if (win) openWindows.push(win);
    }

    open3dBtn.on('click',      () => openDashboard(`${base}?view=3d`,      'scene',   'width=800,height=600'));
    openPlotBtn.on('click',    () => openDashboard(`${base}?view=plot`,    'plot',    'width=600,height=400'));
    openOverlayBtn.on('click', () => openDashboard(`${base}?view=overlay`, 'overlay', 'width=400,height=250'));
    openAllBtn.on('click', () => {
        openDashboard(`${base}?view=3d`,      'scene',   'width=800,height=600');
        openDashboard(`${base}?view=plot`,    'plot',    'width=600,height=400');
        openDashboard(`${base}?view=overlay`, 'overlay', 'width=400,height=250');
    });
    closeAllBtn.on('click', () => {
        openWindows.forEach(win => { if (!win.closed) win.close(); });
        openWindows.length = 0;
    });

    // ── Worker responses ──

    function onMessage(msg) {
        switch (msg.type) {
            case 'equations:loaded':
                equationsLoaded = true;
                buildParamSliders(msg.data.params);
                buildVisualizationTab(msg.data.intSpeciesNames, msg.data.extSpeciesNames);
                updateStatus();
                checkReady();
                break;

            case 'data:loaded':
                dataLoaded = true;
                updateStatus();
                checkReady();
                break;

            case 'state:finished':
                break;

            case 'error':
                console.error('[Worker error]', msg.data.message);
                break;
        }
    }

    function checkReady() {
        if (dataLoaded && equationsLoaded) {
            execFolder.disabled = false;
        }
    }

    function updateStatus() {
        const eq = equationsLoaded ? '✅' : '⏳';
        const dt = dataLoaded ? '✅' : '⏳';
        statusText.controller.value.setRawValue(`Eq ${eq}  Data ${dt}`);
    }

    function buildParamSliders(params) {
        // Remove previous children
        paramsFolder.children.forEach(c => paramsFolder.remove(c));
        paramsFolder.disabled = false;

        const local = { ...params };

        Object.keys(local).forEach((paramName) => {
            const binding = paramsFolder.addBinding(local, paramName, {
                label: paramName,
                step: 0.00001,
            });
            binding.on('change', () => {
                send({ type: 'command:setParam', data: { paramName, value: local[paramName] } });
            });
        });
    }

    // ── Build Visualization Tab (called once after equations load) ──

    function buildVisualizationTab(intSpeciesNames, extSpeciesNames) {
        vizPage.disabled = false;

        // ── Visualization folder ──
        const vizFolder = vizPage.addFolder({ title: 'Visualization' });
        vizPage.addBlade({ view: 'separator' });
        const meshFolder = vizPage.addFolder({ title: 'Mesh rendering' });
        vizPage.addBlade({ view: 'separator' });
        const colorPickerFolder = vizPage.addFolder({ title: 'Color of Reporter molecules' });

        const visualSettings = {
            bacteria: true,
            mesh: false,
            species: 'null',
            helperCoordinates: false,
        };
        const meshScaleSettings = {
            meshHeightScale: 60,
            meshTranslationZ: 0,
            colorMultiplier: 100,
        };

        // Mesh toggle
        const meshBinding = vizFolder.addBinding(visualSettings, 'mesh', { label: 'Mesh' });
        meshBinding.on('change', () => {
            send({ type: 'command:viz', data: { action: 'setMeshVisible', value: visualSettings.mesh } });
            selectSpeciesBinding.disabled = !visualSettings.mesh;
        });

        // Species selector (for concentration field on mesh)
        const options = {};
        extSpeciesNames.forEach(name => { options[name] = name; });

        const selectSpeciesBinding = vizFolder.addBinding(visualSettings, 'species', {
            label: 'Select Species',
            options,
        });
        selectSpeciesBinding.on('change', (ev) => {
            send({ type: 'command:selectSpecies', data: { speciesName: ev.value } });
            send({ type: 'command:viz', data: { action: 'selectSpecies', value: ev.value } });
        });
        selectSpeciesBinding.disabled = true;

        // Bacteria toggle
        const bacteriaBinding = vizFolder.addBinding(visualSettings, 'bacteria', { label: 'Bacteria' });
        bacteriaBinding.on('change', () => {
            send({ type: 'command:viz', data: { action: 'setCapsuleVisibility', value: visualSettings.bacteria } });
        });

        // Helper coordinates toggle
        const helperBinding = vizFolder.addBinding(visualSettings, 'helperCoordinates', { label: 'Helper Coordinates' });
        helperBinding.on('change', () => {
            send({ type: 'command:viz', data: { action: 'visibleGridAndAxes', value: visualSettings.helperCoordinates } });
        });

        // ── Mesh scale controls ──
        const meshHeightBinding = meshFolder.addBinding(meshScaleSettings, 'meshHeightScale', { label: 'Z-Scale mesh', step: 0.1 });
        const meshOffsetBinding = meshFolder.addBinding(meshScaleSettings, 'meshTranslationZ', { label: 'Mesh offset', step: 0.1 });
        const colorMultBinding  = meshFolder.addBinding(meshScaleSettings, 'colorMultiplier', { label: 'Scale color', step: 0.1 });

        meshHeightBinding.on('change', () => {
            send({ type: 'command:viz', data: { action: 'setMeshScale', value: meshScaleSettings.meshHeightScale } });
        });
        meshOffsetBinding.on('change', () => {
            send({ type: 'command:viz', data: { action: 'translateMesh', value: meshScaleSettings.meshTranslationZ } });
        });
        colorMultBinding.on('change', () => {
            send({ type: 'command:viz', data: { action: 'setColorMultiplier', value: meshScaleSettings.colorMultiplier } });
        });

        // ── Color pickers per intracellular species ──
        const someColors = [
            { r: 0, g: 0, b: 255, a: 1, intesity: 0 },
            { r: 0, g: 255, b: 0, a: 1, intesity: 0 },
            { r: 255, g: 0, b: 255, a: 1, intesity: 0 },
            { r: 0, g: 255, b: 255, a: 1, intesity: 0 },
            { r: 255, g: 0, b: 0, a: 1, intesity: 0 },
            { r: 255, g: 255, b: 0, a: 1, intesity: 0 },
            { r: 100, g: 255, b: 25, a: 1, intesity: 0 },
            { r: 255, g: 25, b: 100, a: 1, intesity: 0 },
            { r: 25, g: 100, b: 255, a: 1, intesity: 0 },
            { r: 255, g: 100, b: 25, a: 1, intesity: 0 },
            { r: 100, g: 25, b: 255, a: 1, intesity: 0 },
            { r: 255, g: 255, b: 255, a: 1, intesity: 0 },
        ];

        const PARAMS = {};
        intSpeciesNames.forEach((name, i) => {
            PARAMS[name] = { ...someColors[i % someColors.length] };

            const colorBinding = colorPickerFolder.addBinding(PARAMS, name);
            const intensityBinding = colorPickerFolder.addBinding(PARAMS[name], 'intesity', {
                label: 'Intensity',
                step: 0.001,
            });

            // Send initial color to worker
            send({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });

            colorBinding.on('change', () => {
                send({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });
            });
            intensityBinding.on('change', () => {
                send({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });
            });
        });
    }

    // ── Utility ──

    function pickFile(accept, callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        document.body.appendChild(input);
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => callback(e.target.result);
                reader.readAsText(file);
            }
            document.body.removeChild(input);
        };
        input.click();
    }
}
