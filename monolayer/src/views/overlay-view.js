/**
 * overlay-view.js — Text stats dashboard window.
 *
 * Receives simulation progress data from the SharedWorker and
 * displays step count, simulated time, and integral values.
 */

import { connectToWorker } from '../lib/worker-client.js';

export function mountOverlayView(workerName) {
    // ── DOM setup ──
    const overlay = document.createElement('div');
    overlay.id = 'dynamic-text-overlay';
    overlay.innerText = 'Waiting for simulation…';
    document.body.appendChild(overlay);

    // ── Worker connection ──
    connectToWorker(['state:overlay'], onMessage, workerName);

    function onMessage(msg) {
        if (msg.type !== 'state:overlay') return;

        const d = msg.data;
        const timeInMinutes = d.currentTimeStep * d.fromStepToMinutes;
        const totalSeconds  = Math.floor(timeInMinutes * 60);
        const hours   = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');

        overlay.innerText =
            `Step: ${d.currentTimeStep} / ${d.numberOfTimeSteps}\n` +
            `Time: ${hh}:${mm}:${ss} hh:mm:ss\n` +
            `One step represents ${(d.fromStepToMinutes * 60).toFixed(0)} seconds`;
    }
}
