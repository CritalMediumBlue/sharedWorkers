import { randomSeed } from '../simulation/equations.js';
import { processFileData } from '../simulation/dataProcessor.js';
import { packTrajectories } from '../simulation/trajectories.js';

export function wireControllerHandlers({ sendMessage, ui, state, cloneSimulation }) {
    const {
        loadEqBtn,
        loadDataBtn,
        loadEqBtnSim,
        initBtn,
        playBtn,
        resetBtn,
        loadDataBtnSim,
        stepBtn,
        open3dBtn,
        openPlotBtn,
        openOverlayBtn,
        openPhasePortraitBtn,
        openAllBtn,
        closeAllBtn,
        statusTextState,
        statusTextEq,
        execFolder,
        dataCollectFolder,
        uiState,
        uiStateTraj,
        paramsFolder,
        vizPage,
        base,
        openWindows,
        cloneBtn,
        startSaveBtn,
        stopSaveBtn,
        physicsToggle,
        physicsState,
        seedState,
        seedBinding,
        newSeedBtn,
    } = ui;

    cloneBtn.on('click', () => cloneSimulation(state));

    const setSeed = (seed) => {
        state.seed = seed >>> 0;
        sendMessage({ type: 'command:setSeed', data: { seed: state.seed } });
    };
    seedBinding.on('change', (ev) => setSeed(Math.round(ev.value)));
    newSeedBtn.on('click', () => {
        seedState.seed = randomSeed();
        seedBinding.refresh();
        setSeed(seedState.seed);
    });

    loadEqBtn.on('click', () => {
        pickFile('.js', (text, filename) => { // pick and then send to worker
            sendMessage({ type: 'command:loadEquations', data: { text, filename } });
            state.paramOverrides = {};
            state.equationsText = text;
            state.equationsFileTitle = filename;
            updateStatus();
        });
    });

    loadEqBtnSim.on('click', () => {
        pickFile('.js', (text, filename) => { // pick and then send to worker
            sendMessage({ type: 'command:loadEquations', data: { text, filename } });
            state.paramOverrides = {};
            state.equationsText = text;
            state.equationsFileTitle = filename;
            updateStatus();
        });
    });

    // The page parses a trajectory file once and keeps only the packed typed arrays
    // (trajectories.js); every simulation (and every clone) receives a copy of those,
    // instead of the raw text it would have to parse into millions of objects.
    const loadTrajectories = (text, filename) => {
        let trajectories;
        try {
            trajectories = packTrajectories(processFileData(text, filename));
        } catch (err) {
            alert(`Could not read the trajectory data: ${err.message}`);
            return;
        }
        state.trajectories = trajectories;
        state.dataFileTitle = filename;
        sendMessage({ type: 'command:loadTrajectories', data: { trajectories } });
        updateStatus();
    };

    loadDataBtn.on('click', () => pickFile('.json', loadTrajectories));
    loadDataBtnSim.on('click', () => pickFile('.json', loadTrajectories));

    initBtn.on('click', () => sendMessage({ type: 'command:init' }));
    playBtn.on('click', () => sendMessage({ type: 'command:toggle' }));
    resetBtn.on('click', () => sendMessage({ type: 'command:reset' }));
    stepBtn.on('click', () => sendMessage({ type: 'command:stepForward' }));
    const setSaving = (enabled) => {
        state.savingEnabled = enabled;
        sendMessage({ type: 'command:setSaving', data: { enabled } });
    };
    startSaveBtn.on('click', () => setSaving(true));
    stopSaveBtn.on('click', () => setSaving(false));

    physicsToggle.on('change', (ev) => {
        state.physicsEnabled = ev.value;
        sendMessage({ type: 'command:setPhysicsMode', data: { enabled: ev.value } });
        checkReady();
    });

    open3dBtn.on('click', () => openDashboard(`${base}?view=3d&worker=${state.workerName}`, `scene-${state.workerName}`, 'width=800,height=600'));
    openPlotBtn.on('click', () => openDashboard(`${base}?view=plot&worker=${state.workerName}`, `plot-${state.workerName}`, 'width=1600,height=300'));
    openOverlayBtn.on('click', () => openDashboard(`${base}?view=overlay&worker=${state.workerName}`, `overlay-${state.workerName}`, 'width=400,height=250'));
    openPhasePortraitBtn.on('click', () => openDashboard(`${base}?view=phase-portrait&worker=${state.workerName}`, `phase-portrait-${state.workerName}`, 'width=800,height=600'));
    openAllBtn.on('click', () => {
        openDashboard(`${base}?view=3d&worker=${state.workerName}`, `scene-${state.workerName}`, 'width=800,height=600');
        openDashboard(`${base}?view=plot&worker=${state.workerName}`, `plot-${state.workerName}`, 'width=1600,height=300');
        openDashboard(`${base}?view=overlay&worker=${state.workerName}`, `overlay-${state.workerName}`, 'width=400,height=250');
        openDashboard(`${base}?view=phase-portrait&worker=${state.workerName}`, `phase-portrait-${state.workerName}`, 'width=800,height=600');
    });
    closeAllBtn.on('click', closeAllDashboards);

    window.addEventListener('beforeunload', () => {
        closeAllDashboards();
        // A controller that attached to a simulation of another window leaves it running
        if (state.ownsWorker) sendMessage({ type: 'command:terminate' });
    });

    function onMessage(msg) {
        switch (msg.type) {
            case 'equations:loaded':
                state.equationsLoaded = true;
                state.equations = msg.data;
                buildParamSliders(msg.data.params);
                buildVisualizationTab(msg.data.intSpeciesNames, msg.data.extSpeciesNames);
                updateStatus();
                checkReady();
                break;

            case 'data:loaded':
                state.dataLoaded = true;
                state.data = msg.data;
                state.dataFileTitle = msg.data.fileTitle || '';
                buildSavingFrequencySlider();
                updateStatus();
                checkReady();
                break;

            case 'error':
                console.error('[Worker error]', msg.data.message);
                break;
            case 'state:save': {
                const json = JSON.stringify(msg.data.data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                // Prefix with the simulation name and seed, so that the downloads of
                // simulations running in parallel can be told apart (and sorted per run)
                const safeName = state.workerName.replace(/[^\w.-]/g, '-');
                a.download = `${safeName}_seed-${state.seed}_${msg.data.filename}`;
                a.click();
                URL.revokeObjectURL(url);
                break;
            }
            case 'state:cloned':
                break;
        }
    }

    function checkReady() {
        if (physicsState.enabled && state.equationsLoaded) {
            execFolder.disabled = false;
        } else if (state.dataLoaded && state.equationsLoaded) {
            execFolder.disabled = false;
        } else {
            execFolder.disabled = true;
        }
    }

    function updateStatus() {
        
        const eq = state.equationsLoaded ? '' : 'Not loaded';
        const dt = state.dataLoaded ? '' : 'Not loaded';
        const eqTitle = state.equationsLoaded ? state.equations.fileTitle : '';
        const dtTitle = state.dataLoaded ? state.dataFileTitle : '';
        statusTextState.controller.value.setRawValue(`${dt} ${dtTitle}`);
        statusTextEq.controller.value.setRawValue(`${eq} ${eqTitle}`);
        uiStateTraj.eqStatus = `${dtTitle} ${dt}`;
        uiState.eqStatus = `${eqTitle} ${eq}`;
    }

    function buildParamSliders(params) {
        paramsFolder.children.forEach(c => paramsFolder.remove(c));
        paramsFolder.disabled = false;

        // Overrides (from the sliders, or copied by a clone) take precedence over the file
        const overrides = Object.fromEntries(
            Object.entries(state.paramOverrides).filter(([name]) => name in params));
        const local = { ...params, ...overrides };
        Object.entries(overrides).forEach(([paramName, value]) => {
            sendMessage({ type: 'command:setParam', data: { paramName, value } });
        });

        Object.keys(local).forEach((paramName) => {
            const binding = paramsFolder.addBinding(local, paramName, {
                label: paramName,
                step: 0.0000001,
            });
            binding.on('change', () => {
                state.paramOverrides[paramName] = local[paramName];
                sendMessage({ type: 'command:setParam', data: { paramName, value: local[paramName] } });
            });
        });
    }

    function buildSavingFrequencySlider(){
        dataCollectFolder.disabled = false;
        let freq = { value: state.savingFrequency };
        const savingFrequencySlider = dataCollectFolder.addBinding(freq, 'value', {
            label: 'Saving frequency (steps)',
            step: 1,
            min: 1,
        });
        savingFrequencySlider.on('change', () => {
            state.savingFrequency = freq.value;
            sendMessage({ type: 'command:setSavingFrequency', data: { frequency: freq.value } });
        });
    }

    function buildVisualizationTab(intSpeciesNames, extSpeciesNames) {
        vizPage.disabled = false;

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
            meshTranslationZ: -2,
            colorMultiplier: 100,
        };

        const meshBinding = vizFolder.addBinding(visualSettings, 'mesh', { label: 'Mesh' });
        meshBinding.on('change', () => {
            sendMessage({ type: 'command:viz', data: { action: 'setMeshVisible', value: visualSettings.mesh } });
            selectSpeciesBinding.disabled = !visualSettings.mesh;
        });

        const options = {};
        extSpeciesNames.forEach(name => { options[name] = name; });

        const selectSpeciesBinding = vizFolder.addBinding(visualSettings, 'species', {
            label: 'Select Species',
            options,
        });
        selectSpeciesBinding.on('change', (ev) => {
            sendMessage({ type: 'command:selectSpecies', data: { speciesName: ev.value } });
            sendMessage({ type: 'command:viz', data: { action: 'selectSpecies', value: ev.value } });
        });
        selectSpeciesBinding.disabled = true;

        const bacteriaBinding = vizFolder.addBinding(visualSettings, 'bacteria', { label: 'Bacteria' });
        bacteriaBinding.on('change', () => {
            sendMessage({ type: 'command:viz', data: { action: 'setCapsuleVisibility', value: visualSettings.bacteria } });
        });

        const helperBinding = vizFolder.addBinding(visualSettings, 'helperCoordinates', { label: 'Helper Coordinates' });
        helperBinding.on('change', () => {
            sendMessage({ type: 'command:viz', data: { action: 'visibleGridAndAxes', value: visualSettings.helperCoordinates } });
        });

        const meshHeightBinding = meshFolder.addBinding(meshScaleSettings, 'meshHeightScale', { label: 'Z-Scale mesh', step: 0.1 });
        const meshOffsetBinding = meshFolder.addBinding(meshScaleSettings, 'meshTranslationZ', { label: 'Mesh offset', step: 0.1 });
        const colorMultBinding = meshFolder.addBinding(meshScaleSettings, 'colorMultiplier', { label: 'Scale color', step: 0.1 });

        meshHeightBinding.on('change', () => {
            sendMessage({ type: 'command:viz', data: { action: 'setMeshScale', value: meshScaleSettings.meshHeightScale } });
        });
        meshOffsetBinding.on('change', () => {
            sendMessage({ type: 'command:viz', data: { action: 'translateMesh', value: meshScaleSettings.meshTranslationZ } });
        });
        colorMultBinding.on('change', () => {
            sendMessage({ type: 'command:viz', data: { action: 'setColorMultiplier', value: meshScaleSettings.colorMultiplier } });
        });

        const someColors = [
            { r: 0, g: 0, b: 255, a: 1, intensity: 0 }, 
            { r: 0, g: 255, b: 0, a: 1, intensity: 0 }, 
            { r: 255, g: 0, b: 0, a: 1, intensity: 0 }, 
            { r: 255, g: 0, b: 255, a: 1, intensity: 0 }, 
            { r: 0, g: 255, b: 255, a: 1, intensity: 0 }, 
            { r: 255, g: 255, b: 0, a: 1, intensity: 0 }
        ];

        // Colours chosen earlier (or copied by a clone) take precedence over the defaults
        const PARAMS = {};
        const recordColor = (name) => { state.bacteriaColors[name] = { ...PARAMS[name] }; };
        intSpeciesNames.forEach((name, i) => {
            PARAMS[name] = { ...(state.bacteriaColors[name] ?? someColors[i % someColors.length]) };
            recordColor(name);

            const colorBinding = colorPickerFolder.addBinding(PARAMS, name);
            const intensityBinding = colorPickerFolder.addBinding(PARAMS[name], 'intensity', {
                label: 'Intensity',
                step: 0.00001,
            });

            sendMessage({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });

            colorBinding.on('change', () => {
                recordColor(name);
                sendMessage({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });
            });
            intensityBinding.on('change', () => {
                recordColor(name);
                sendMessage({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });
            });
        });
    }

    function pickFile(accept, callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        document.body.appendChild(input);
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => callback(e.target.result, file.name);
                reader.readAsText(file);
            }
            document.body.removeChild(input);
        };
        input.click();
    }

    function openDashboard(url, name, features) {
        const win = window.open(url, name, features);
        if (win) openWindows.push(win);
    }

    function closeAllDashboards() {
        openWindows.forEach(win => { if (!win.closed) win.close(); });
        openWindows.length = 0;
    }

  

    return { onMessage };
}
