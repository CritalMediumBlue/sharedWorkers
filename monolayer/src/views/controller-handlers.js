export function wireControllerHandlers({ sendMessage, ui, state, newSimulation}) {
    const {
        loadEqBtn,
        loadDataBtn,
        initBtn,
        playBtn,
        resetBtn,
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
        paramsFolder,
        vizPage,
        base,
        openWindows,
        cloneBtn,
    } = ui;

    cloneBtn.on('click', () => {
        const newWorkerName = prompt('Enter name for the new simulation:', `${state.workerName}`);
        if (newWorkerName) {
            newSimulation(newWorkerName, state);
        } else {
            alert('Simulation name cannot be empty.');
        }
    });

    loadEqBtn.on('click', () => {
        pickFile('.js', (text, filename) => { // pick and then send to worker
            sendMessage({ type: 'command:loadEquations', data: { text, filename } });
            state.equationsText = text;
            state.equationsFileTitle = filename;
            updateStatus();
        });
    });

    loadDataBtn.on('click', () => {
        pickFile('.json', (text, filename) => { // pick and then send to worker
            sendMessage({ type: 'command:loadData', data: { text, filename } });
            state.dataText = text;
            state.dataFileTitle = filename;
            updateStatus();
        });
    });

    initBtn.on('click', () => sendMessage({ type: 'command:init' }));
    playBtn.on('click', () => sendMessage({ type: 'command:toggle' }));
    resetBtn.on('click', () => sendMessage({ type: 'command:reset' }));
    stepBtn.on('click', () => sendMessage({ type: 'command:stepForward' }));

    open3dBtn.on('click', () => openDashboard(`${base}?view=3d&worker=${state.workerName}`, 'scene', 'width=800,height=600'));
    openPlotBtn.on('click', () => openDashboard(`${base}?view=plot&worker=${state.workerName}`, 'plot', 'width=600,height=400'));
    openOverlayBtn.on('click', () => openDashboard(`${base}?view=overlay&worker=${state.workerName}`, 'overlay', 'width=400,height=250'));
    openPhasePortraitBtn.on('click', () => openDashboard(`${base}?view=phase-portrait&worker=${state.workerName}`, 'phase-portrait', 'width=800,height=600'));
    openAllBtn.on('click', () => {
        openDashboard(`${base}?view=3d&worker=${state.workerName}`, 'scene', 'width=800,height=600');
        openDashboard(`${base}?view=plot&worker=${state.workerName}`, 'plot', 'width=600,height=400');
        openDashboard(`${base}?view=overlay&worker=${state.workerName}`, 'overlay', 'width=400,height=250');
        openDashboard(`${base}?view=phase-portrait&worker=${state.workerName}`, 'phase-portrait', 'width=800,height=600');
    });
    closeAllBtn.on('click', closeAllDashboards);

    window.addEventListener('beforeunload', () => {
        closeAllDashboards();
        sendMessage({ type: 'command:terminate' });
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
                updateStatus();
                checkReady();
                break;

            case 'error':
                console.error('[Worker error]', msg.data.message);
                break;
            case 'state:cloned':
                break;
        }
    }

    function checkReady() {
        if (state.dataLoaded && state.equationsLoaded) {
            execFolder.disabled = false;
        }
        console.log('check was called')
    }

    function updateStatus() {
        const eq = state.equationsLoaded ? '✅ Loaded' : 'No file loaded';
        const dt = state.dataLoaded ? '✅ Loaded' : 'No file loaded';
        const eqTitle = state.equationsLoaded ? state.equations.fileTitle : '';
        const dtTitle = state.dataLoaded ? state.dataFileTitle : '';
        statusTextState.controller.value.setRawValue(`${dt} ${dtTitle}`);
        statusTextEq.controller.value.setRawValue(`${eq} ${eqTitle}`);
    }

    function buildParamSliders(params) {
        paramsFolder.children.forEach(c => paramsFolder.remove(c));
        paramsFolder.disabled = false;

        const local = { ...params };

        Object.keys(local).forEach((paramName) => {
            const binding = paramsFolder.addBinding(local, paramName, {
                label: paramName,
                step: 0.00001,
            });
            binding.on('change', () => {
                sendMessage({ type: 'command:setParam', data: { paramName, value: local[paramName] } });
            });
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
            meshTranslationZ: 0,
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
            { r: 0, g: 0, b: 255, a: 1, intesity: 0 }, 
            { r: 0, g: 255, b: 0, a: 1, intesity: 0 }, 
            { r: 255, g: 0, b: 0, a: 1, intesity: 0 }, 
            { r: 255, g: 0, b: 255, a: 1, intesity: 0 }, 
            { r: 0, g: 255, b: 255, a: 1, intesity: 0 }, 
            { r: 255, g: 255, b: 0, a: 1, intesity: 0 }
        ];

        const PARAMS = {};
        intSpeciesNames.forEach((name, i) => {
            PARAMS[name] = { ...someColors[i % someColors.length] };

            const colorBinding = colorPickerFolder.addBinding(PARAMS, name);
            const intensityBinding = colorPickerFolder.addBinding(PARAMS[name], 'intesity', {
                label: 'Intensity',
                step: 0.001,
            });

            sendMessage({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });

            colorBinding.on('change', () => {
                sendMessage({ type: 'command:setBacteriaColor', data: { species: name, color: PARAMS[name] } });
            });
            intensityBinding.on('change', () => {
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
