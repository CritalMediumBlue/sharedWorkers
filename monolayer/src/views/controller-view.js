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
import { createControllerUI } from './controller-ui.js';
import { wireControllerHandlers } from './controller-handlers.js';

export function mountControllerView() {

    const paneDiv = document.createElement('div');
    paneDiv.id = 'pane';
    document.body.appendChild(paneDiv);


    const initializeNewSimulation = (workerName) => {
        const ui = createControllerUI(paneDiv, workerName);
        const state = {
            workerName: workerName,
            dataLoaded: false,
            equationsLoaded: false,
            equationsFileTitle: '',
            dataFileTitle: '',
        };

        let send = () => {};
        const { onMessage } = wireControllerHandlers({
            sendMessage: (msg) => send(msg),
            ui,
            state,
            newSimulation: initializeNewSimulation, 
        });

        ({ send } = connectToWorker(
            ['equations:loaded', 'data:loaded', 'error'],
            onMessage,
            workerName
        ));
    }

        initializeNewSimulation('1');

}
