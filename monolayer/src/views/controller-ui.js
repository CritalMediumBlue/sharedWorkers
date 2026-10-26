import { Pane } from 'tweakpane';

export function createControllerUI(paneDiv, workerName) {
    const pane = new Pane({title: `Simulation ${workerName}`, container: paneDiv });
    const tab = pane.addTab({
        pages: [
            { title: 'Execution' },
            { title: 'Parameters' },
            { title: 'Visualization' },
            { title: 'Dashboards' },
        ],
    });




    const executionPage = tab.pages[0];

    const loadFolder = executionPage.addFolder({ title: 'Simulate from Precomputed Trajectories',
        expanded: false
     });
   
    const loadEqBtn = loadFolder.addButton({ title: '📂', label: 'Load equations file' });

    const loadDataBtn = loadFolder.addButton({ title: '📂', label: 'Load trajectory data' });
 
    executionPage.addBlade({ view: 'separator' });

    const simulationFolder = executionPage.addFolder({ title: 'Generate Trajectories from Scratch' ,
    expanded: false
    });
    const loadEqBtnSim = simulationFolder.addButton({ title: '📂', label: 'Load equations file' });

    const loadDataBtnSim = simulationFolder.addButton({ title: '📂', label: 'Load generation rules' });

    const physicsState = { enabled: false };
    const physicsToggle = simulationFolder.addBinding(physicsState, 'enabled', {
        label: 'Physics mode',
    });
   

    executionPage.addBlade({ view: 'separator' });
/*    const statusTextState = executionPage.addBlade({
        view: 'text',
        readonly: true,
        parse: (v) => String(v),
        value: 'No trajectories file loaded',
    }); */

/*     const statusTextEq = executionPage.addBlade({
        view: 'text',
        readonly: true,
        parse: (v) => String(v),
        value: 'No equations file loaded',
    }); */


const uiState = {
    eqStatus: 'Not loaded',
};

const statusTextEq = executionPage.addBinding(uiState, 'eqStatus', {
    readonly:true,
    label:'Equations file'
});


const uiStateTraj = {
    eqStatus: 'Not loaded',
};

const statusTextState = executionPage.addBinding(uiStateTraj, 'eqStatus', {
    readonly:true,
    label:'Trajectory file'
});

executionPage.addBlade({ view: 'separator' });



    const execFolder = executionPage.addFolder({ title: 'Manage Simulation' });
    execFolder.disabled = true;
   
    // Seed of the random draws in the equations file (e.g. initial producer flags);
    // used at Initialize and Reset, so a run is reproducible from its seed.
    const seedState = { seed: 0 };
    const seedBinding = execFolder.addBinding(seedState, 'seed', {
        label: 'Seed', step: 1, min: 0, max: 4294967295, format: (v) => String(Math.round(v)),
    });
    const newSeedBtn = execFolder.addButton({ title: '🎲', label: 'New seed' });
    const initBtn = execFolder.addButton({ title: '🚀', label: 'Initialize' });
    const playBtn = execFolder.addButton({ title: '▶/⏸', label: 'Run / Pause' });
    const resetBtn = execFolder.addButton({ title: '↺', label: 'Reset' });
    const stepBtn = execFolder.addButton({ title: '⏭', label: 'Step Forward' });
    const cloneBtn = execFolder.addButton({ title: '⎘', label: 'Clone Simulation' });
    const dataCollectFolder = executionPage.addFolder({ title: 'Data Collection' });
    dataCollectFolder.disabled = true;
  
    const startSaveBtn = dataCollectFolder.addButton({ title: '💾 Start Saving', label: 'Save state' });
    const stopSaveBtn = dataCollectFolder.addButton({ title: '⏹ Stop Saving', label: 'Save state' });

    const paramsPage = tab.pages[1];
    const paramsFolder = paramsPage.addFolder({ title: 'Parameters' });
    paramsFolder.disabled = true;

    const vizPage = tab.pages[2];
    vizPage.disabled = true;

    const dashPage = tab.pages[3];
    const base = `${location.origin}${location.pathname}`;
    const openWindows = [];

    const open3dBtn = dashPage.addButton({ title: '🖥️  3D Scene' });
    const openPlotBtn = dashPage.addButton({ title: '📊  Plot' });
    const openOverlayBtn = dashPage.addButton({ title: '  Monitor' });
    const openPhasePortraitBtn = dashPage.addButton({ title: '📈  Phase Portrait' });
    dashPage.addBlade({ view: 'separator' });
    const openAllBtn = dashPage.addButton({ title: '🚀  Open All' });
    const closeAllBtn = dashPage.addButton({ title: '🛑  Close All' });

    return {
        pane,
        tab,
        executionPage,
        loadEqBtn,
        loadEqBtnSim,
        loadDataBtnSim,
        statusTextEq,
        uiState,
        uiStateTraj,
        loadDataBtn,
        statusTextState,
        execFolder,
        initBtn,
        playBtn,
        resetBtn,
        stepBtn,
        paramsFolder,
        vizPage,
        base,
        openWindows,
        open3dBtn,
        openPlotBtn,
        openOverlayBtn,
        openPhasePortraitBtn,
        openAllBtn,
        closeAllBtn,
        cloneBtn,
        startSaveBtn,
        stopSaveBtn,
        dataCollectFolder,
        physicsToggle,
        physicsState,
        seedState,
        seedBinding,
        newSeedBtn,
    };
}
