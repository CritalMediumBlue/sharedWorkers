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
