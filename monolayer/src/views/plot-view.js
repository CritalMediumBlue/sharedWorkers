/**
 * plot-view.js — Chart.js dashboard window.
 *
 * Receives histories (mean ± stddev time series) from the SharedWorker
 * and renders them using the existing plot.js / plotOptions.js modules.
 */

import { connectToWorker } from '../lib/worker-client.js';
import { Chart } from '../rendering/vendor.js';
import { setupPlot, updatePlot } from '../rendering/plot.js';

export function mountPlotView() {
    // ── DOM setup — create the element that plot.js looks for ──
    const plotDiv = document.createElement('div');
    plotDiv.id = 'plot-overlay';
    document.body.appendChild(plotDiv);

    let chart = null;
    let colorRule = {};

    // ── Worker connection ──
    connectToWorker(
        ['state:init', 'state:histories', 'state:coloringRule'],
        onMessage,
    );

    function onMessage(msg) {
        switch (msg.type) {
            case 'state:init': {
                // Build a minimal vars-like object that setupPlot expects
                const fakeVars = { int: {} };
                (msg.data.speciesNames || []).forEach((name) => {
                    fakeVars.int[name] = { name };
                });
                colorRule = msg.data.coloringRule || {};
                chart = setupPlot(Chart, fakeVars, colorRule);
                break;
            }

            case 'state:histories':
                if (chart) {
                    updatePlot(msg.data, chart, colorRule);
                }
                break;

            case 'state:coloringRule':
                colorRule = msg.data;
                break;
        }
    }
}
