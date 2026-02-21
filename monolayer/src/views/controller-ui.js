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

    const loadFolder = executionPage.addFolder({ title: 'Load files to execute' });
    const loadEqBtn = loadFolder.addButton({ title: '📂', label: 'Load equations file' });
    const statusTextEq = loadFolder.addBlade({
        view: 'text',
        readonly: true,
        parse: (v) => String(v),
        value: 'No file loaded',
    });
    const loadDataBtn = loadFolder.addButton({ title: '📂', label: 'Load state file' });
    const statusTextState = loadFolder.addBlade({
        view: 'text',
        readonly: true,
        parse: (v) => String(v),
        value: 'No file loaded',
    });

    executionPage.addBlade({ view: 'separator' });

    const execFolder = executionPage.addFolder({ title: 'Manage Simulation' });
    execFolder.disabled = true;
    const nameInput = execFolder.addBlade({
        view: 'text',
        readonly: false,
        parse: (v) => String(v),
        value: 'My Simulation',
    });
    const initBtn = execFolder.addButton({ title: '🚀', label: 'Initialize' });
    const playBtn = execFolder.addButton({ title: '▶/⏸', label: 'Run / Pause' });
    const resetBtn = execFolder.addButton({ title: '↺', label: 'Reset' });
    const stepBtn = execFolder.addButton({ title: '⏭', label: 'Step Forward' });
    const cloneBtn = execFolder.addButton({ title: '⎘', label: 'Clone Simulation' });

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
    dashPage.addBlade({ view: 'separator' });
    const openAllBtn = dashPage.addButton({ title: '🚀  Open All' });
    const closeAllBtn = dashPage.addButton({ title: '🛑  Close All' });

    return {
        pane,
        tab,
        executionPage,
        loadEqBtn,
        statusTextEq,
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
        openAllBtn,
        closeAllBtn,
        cloneBtn,
    };
}
