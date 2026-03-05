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

    
        const firstWorkerName = prompt('Enter name for the simulation:', '1');
        initializeNewSimulation(firstWorkerName, null);

}




    const initializeNewSimulation = (workerName, cloneData = null) => {
        const paneDiv = document.createElement('div');
        paneDiv.id = 'pane';
        document.body.appendChild(paneDiv);

        const ui = createControllerUI(paneDiv, workerName);
        
        const state = {
            workerName,
            dataLoaded: false,
            equationsLoaded: false,
            equations: null,
            data: null,
            dataFileTitle: '',
            equationsText: '',
            dataText: '',
        };

        let send = () => {};
        const { onMessage } = wireControllerHandlers({
            sendMessage: (msg) => send(msg),
            ui,
            state,
            newSimulation: initializeNewSimulation,
        });
         //load default equations and default data. 
         



        ({ send } = connectToWorker(
            ['equations:loaded', 'data:loaded', 'error', 'state:save'],
            onMessage,
            workerName
        ));

        // If cloning, send data after connection is established
        if (cloneData) {
            // Store the text immediately so this clone can also be cloned
            state.equationsText = cloneData.equationsText;
            state.dataText = cloneData.dataText;
            
            // Use setTimeout to ensure message handler is fully wired up
            setTimeout(() => {
                send({ 
                    type: 'command:loadEquations', 
                    data: { 
                        text: cloneData.equationsText, 
                        filename: cloneData.equations?.fileTitle || 'equations.json'
                    } 
                });
                send({ 
                    type: 'command:loadData', 
                    data: { 
                        text: cloneData.dataText, 
                        filename: cloneData.dataFileTitle || 'data.json'
                    } 
                });
            }, 0);
        }
    }