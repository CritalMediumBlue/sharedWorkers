/**
 * worker-client.js — Shared helper for connecting to the simulation SharedWorker.
 * 
 * @param {string[]} topics  Topics this port wants to receive.
 * @param {(message: any) => void} onMessage  Handles incoming message payloads from the worker.
 * @returns {{ send: (msg: any) => void }}
 */
export function connectToWorker(topics, onMessage, name) {
    // Create a SharedWorker instance pointing to the worker script.
    const worker = new SharedWorker(
        new URL('../simulation-worker.js', import.meta.url),
        { type: 'module', name: name },
    );

    // The SharedWorker exposes a 'port' property for communication.
    const port = worker.port;

    // Forward incoming worker message payloads to the provided callback.
    port.onmessage = (event) => onMessage(event.data);
    // Activate the port so queued and future messages are dispatched.
    port.start();

    // Send messages to the worker.
    const send = (msg) => port.postMessage(msg);
    send({ type: 'subscribe', data: { topics } }); 

    return { send }; 
}

/**
 * Ask the simulation SharedWorker with the given name whether it is still unused.
 * Connecting creates the worker if it does not exist yet; the probe connection is
 * closed again once the answer has arrived.
 *
 * @param {string} name  Simulation (worker) name.
 * @returns {Promise<{ fresh: boolean, seed: number }>}
 */
export function probeWorker(name) {
    return new Promise((resolve) => {
        const worker = new SharedWorker(
            new URL('../simulation-worker.js', import.meta.url),
            { type: 'module', name: name },
        );
        const port = worker.port;
        port.onmessage = (event) => {
            if (event.data.type !== 'state:hello') return;
            port.postMessage({ type: 'command:disconnect' });
            port.close();
            resolve(event.data.data);
        };
        port.start();
        port.postMessage({ type: 'command:hello' });
    });
}
