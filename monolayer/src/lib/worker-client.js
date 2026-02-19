/**
 * worker-client.js — Shared helper for connecting to the simulation SharedWorker.
 *
 * @param {string[]} topics  Topics this port wants to receive.
 * @param {Function} onMessage  Callback invoked with each incoming message object.
 * @returns {{ send: Function }}
 */
export function connectToWorker(topics, onMessage) {
    const worker = new SharedWorker(
        new URL('../simulation-worker.js', import.meta.url),
        { type: 'module', name: 'simulation-worker' },
    );

    const port = worker.port;

    port.onmessage = (event) => onMessage(event.data);
    port.start();

    port.postMessage({ type: 'subscribe', data: { topics } });
    
    const send = (msg) => port.postMessage(msg);

    return { send };
}
