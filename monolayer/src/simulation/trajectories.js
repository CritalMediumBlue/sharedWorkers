/**
 * trajectories.js — Compact storage of precomputed trajectories.
 *
 * processFileData() (dataProcessor.js) returns every cell of every frame as a
 * separate JavaScript object: for LowRes.json about 4.6 million objects and
 * ≈0.6 GB of memory (≈1.5 GB while parsing). In Chrome, all simulations of a
 * tab share one ≈4 GB JavaScript heap, so a few such copies freeze the tab.
 *
 * Here the same data is packed into flat typed arrays (≈36 bytes per cell,
 * ≈0.17 GB for LowRes.json): the controller page parses a file once and sends
 * the packed arrays to every simulation; the batch runner shares them between
 * its threads. frameCells() rebuilds the cells of one frame on demand.
 */

const plainArray = (Type, length) => new Type(length);

/**
 * Pack the output of processFileData() into flat typed arrays.
 *
 * @param {{ bacteriaTimeSeries: object[][], bacteriaLineage: object, averageLifetime: number, fileTitle: string }} processed
 * @param {{ start?: number, end?: number, allocate?: (Type: Function, length: number) => ArrayLike<number> }} [options]
 *   frames [start, end) are packed; `allocate` creates the arrays (e.g. backed by SharedArrayBuffer)
 * @returns {object} packed trajectories (see frameCells / frameCount)
 */
export function packTrajectories(processed, { start = 0, end, allocate = plainArray } = {}) {
    const series = processed.bacteriaTimeSeries;
    const last = Math.min(end ?? series.length, series.length);
    const frames = last - start;
    if (frames <= 0) throw new Error(`Empty frame range [${start}, ${last})`);

    const offsets = allocate(Int32Array, frames + 1);
    offsets[0] = 0;
    for (let f = 0; f < frames; f++) offsets[f + 1] = offsets[f] + series[start + f].length;
    const cellCount = offsets[frames];
    const ids = allocate(Int32Array, cellCount);
    const xs = allocate(Float64Array, cellCount);
    const ys = allocate(Float64Array, cellCount);
    const angles = allocate(Float64Array, cellCount);
    const longAxes = allocate(Float64Array, cellCount);
    for (let f = 0; f < frames; f++) {
        series[start + f].forEach((cell, i) => {
            if (!Number.isInteger(cell.id)) throw new Error(`Cell ids must be integers (got ${cell.id})`);
            const k = offsets[f] + i;
            ids[k] = cell.id;
            xs[k] = cell.x;
            ys[k] = cell.y;
            angles[k] = cell.angle;
            longAxes[k] = cell.longAxis;
        });
    }

    // Lineage id → parent as an array indexed by id (-1: unknown)
    const lineageEntries = Object.entries(processed.bacteriaLineage);
    const maxId = lineageEntries.reduce((m, [id]) => Math.max(m, Number(id)), 0);
    const lineage = allocate(Int32Array, maxId + 1);
    lineage.fill(-1);
    for (const [id, parent] of lineageEntries) lineage[Number(id)] = parent;

    return {
        offsets, ids, xs, ys, angles, longAxes, lineage,
        firstFrame: start,
        averageLifetime: processed.averageLifetime,
        fileTitle: processed.fileTitle,
    };
}

/** Number of packed frames. */
export const frameCount = (trajectories) => trajectories.offsets.length - 1;

/**
 * The cells of packed frame f (counted from the first packed frame), in the
 * format of dataProcessor.js: { id, x, y, angle, longAxis }.
 */
export function frameCells(trajectories, f) {
    const { offsets, ids, xs, ys, angles, longAxes } = trajectories;
    const cells = [];
    for (let k = offsets[f]; k < offsets[f + 1]; k++) {
        cells.push({ id: ids[k], x: xs[k], y: ys[k], angle: angles[k], longAxis: longAxes[k] });
    }
    return cells;
}
