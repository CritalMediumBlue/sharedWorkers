# Phase 0 — Monolayer State-Flow Audit

## 1. File Map (22 source files)

```
src/
├── main.js                          ← orchestrator: animation loop, init, singleStep
├── config.js                        ← CONFIG constants (scene, bacterium, grid, plot, colors)
│
├── state/
│   └── stateManager.js              ← session {play, currentTimeStep}, constants, histories (mean/stddev arrays)
│
├── simulation/
│   ├── simulationManager.js         ← facade: createBacteriumSystem, updateSimulation, getGlobalSpeciesConcentrations
│   └── signallingNetwork/
│       ├── signallingNetwork.js     ← updateSignallingCircuit (ADI diffusion + intracellular ODE loop)
│       ├── grid.js                  ← spatial grid helpers (getAdjustedCoordinates)
│       └── intracellular/
│           ├── cytoplasmManager.js  ← re-exports from cytoplasmState + cytoplasmUpdater
│           ├── cytoplasmState.js    ← global mutable state: variables, parameters, interiorManager, exteriorManager, concentrationsState
│           ├── cytoplasmUpdater.js  ← updateAllCytoplasms, inheritConcentrations, calculateResultArray
│           ├── ODESolver.js         ← simulateConcentrations (Euler), secretedSpeciesUpdate
│           └── ODESolver.test.js
│
├── scene/
│   ├── graphicsManager.js           ← setupNewScene, renderScene, visibility/color helpers
│   ├── graphycLibrariesImports.js   ← re-exports THREE, OrbitControls, Chart
│   ├── plot.js                      ← Chart.js line plot (setupPlot, updatePlot) → #plot-overlay
│   ├── plotOptions.js               ← Chart.js config
│   ├── overlay.js                   ← updateOverlay → #dynamic-text-overlay (step, time, integrals)
│   └── sceneComponents/
│       ├── capsulePool.js           ← bacteria 3D capsules (pool pattern)
│       ├── geometries.js            ← color rules, geometry caches
│       ├── mesh.js                  ← surface mesh (concentration heatmap)
│       └── stage.js                 ← scene + renderer + camera setup
│           └── stageComponetns/
│               ├── camera.js        ← PerspectiveCamera + OrbitControls
│               └── renderer.js      ← WebGLRenderer → appended to document.body
│
└── GUI/
    ├── controlManager.js            ← Tweakpane pane → #pane, 3 tabs
    ├── sessionTab.js                ← Load/run/pause/reset/save buttons
    ├── signallingTab.js             ← Load equations (.js), parameter sliders
    ├── visualizationTab.js          ← mesh/bacteria/species toggles, color pickers
    └── dataProcessor.js             ← JSON file → bacteriaTimeSeries + lineage
```

---

## 2. Data-Flow Trace

### Initialization
```
User loads .json file (sessionTab) → dataProcessor.processFileData()
                                     ↓
                                   {bacteriaTimeSeries, averageLifetime, bacteriaLineage}
                                     ↓
User loads .js equations (signallingTab) → eval() → window.vars, window.params
                                     ↓
                               guiActions.init(processedData)
                                     ↓
main.js init() →  createBacteriumSystem(CONFIG, vars, params, bacteria[0], lineage)
              →  createStates() → session {play, currentTimeStep}
              →  createConstants() → {numberOfTimeSteps, fromStepToMinutes, doublingTime}
              →  createHistories(speciesCount)
              →  setupNewScene(CONFIG, vars) → Three.js scene, capsules, mesh, Chart.js plot
              →  renderScene(...) → first frame
              →  requestAnimationFrame(animate)
```

### Per-Frame Loop (`animate`)
```
requestAnimationFrame(animate)
  │
  ├─ if (session.play) → singleStep()
  │    │
  │    ├─ bacteriaTimeSeries[currentTimeStep]  ← pre-loaded position data
  │    │
  │    ├─ updateSimulation(currentBacteria, fromStepToMinutes)
  │    │    └─ updateSignallingCircuit(...)
  │    │         ├─ createPositionMap(bacteria → grid indices)
  │    │         ├─ loop numberOfIterations:
  │    │         │     clearConcentrationSources()
  │    │         │     updateAllCytoplasms(positionMap, timeLapse, concentrationsState)
  │    │         │       └─ for each bacterium:
  │    │         │            inheritConcentrations → ODE step × 3 substeps
  │    │         │            secretedSpeciesUpdate → sources/sinks
  │    │         │     ADI diffusion per extracellular species
  │    │         └─ calculateResultArray(currentBacteria)
  │    │              → [{id,x,y,angle,longAxis,phenotype,cytoplasmConcentrations,extracellularConcentrations}, ...]
  │    │
  │    ├─ returns {bacteriaDataUpdated, concentrations, totalAimPSpace, totalAimPTime}
  │    │
  │    ├─ getGlobalSpeciesConcentrations(bacteriaDataUpdated)
  │    │    → {mean: [...], standardDeviation: [...]}
  │    │
  │    └─ updateData()
  │         ├─ updateHistories(mean, stddev)
  │         ├─ histories = getHistories()  → [means, stdDevs] with time indices
  │         └─ session.currentTimeStep++
  │
  └─ renderScene(histories, bacteriaDataUpdated, concentrations, BACTERIUM, session, constants, totalAimPSpace, totalAimPTime)
       │
       ├─ every 5 frames:
       │    ├─ updateSurfaceMesh(mesh, concentration[species].conc, ...)   ← heatmap
       │    ├─ updateCapsules(bacteriaData, ...)                            ← 3D bacteria
       │    ├─ every 30 frames: updatePlot(histories, plot, coloringRule)   ← Chart.js
       │    ├─ updateOverlay(session, constants, totalAimPSpace, totalAimPTime) ← text
       │    └─ renderer.render(scene, camera)                               ← Three.js draw
       │
       └─ (otherwise: no-op, frame skipped for rendering)
```

---

## 3. Four UI Consumers & What They Need

| UI Element | DOM Target | Data Needed per Frame | Update Cadence |
|---|---|---|---|
| **3D Scene** (Three.js) | `<canvas>` appended to `<body>` | `bacteriaDataUpdated` (array of {x,y,angle,longAxis,cytoplasmConcentrations}), `concentrations[species].conc` (Float64Array), coloringRule | every 5 frames |
| **Chart.js Plot** | `#plot-overlay` | `histories` = [[timeIndices, mean1, mean2...], [timeIndices, sd1, sd2...]], coloringRule | every 30 frames |
| **Text Overlay** | `#dynamic-text-overlay` | `session.currentTimeStep`, `constants.numberOfTimeSteps`, `constants.fromStepToMinutes`, `totalAimPSpace`, `totalAimPTime` | every 5 frames |
| **Tweakpane GUI** | `#pane` | None (receives nothing). Sends commands back: play/pause, reset, setParam, setVarsAndParams, setBacteriaColor, selectSpecies, mesh toggles, etc. | on user action |

---

## 4. DOM Dependency Check

### ✅ Simulation layer is DOM-free

| Module | DOM access? | Notes |
|---|---|---|
| `simulationManager.js` | **No** | Pure computation facade |
| `signallingNetwork.js` | **No** | ADI + ODE loops, uses `handy-diffusion` (pure math) |
| `grid.js` | **No** | Pure coordinate math |
| `cytoplasmState.js` | **No** | Module-level maps & arrays |
| `cytoplasmUpdater.js` | **No** | Pure iteration + ODE calls |
| `ODESolver.js` | **No** | Pure math (Euler / RK4) |
| `config.js` | **No** | Static object |
| `stateManager.js` | **No** | Session/constants/histories — pure JS objects |

**Verdict: The entire `simulation/` subtree + `state/` + `config.js` can move into a SharedWorker with zero changes.**

### ❌ Scene layer has heavy DOM/WebGL coupling

| Module | DOM access? |
|---|---|
| `graphicsManager.js` | Three.js scene, renderer |
| `plot.js` | `document.getElementById('plot-overlay')`, Chart.js canvas |
| `overlay.js` | `document.getElementById('dynamic-text-overlay')` |
| `renderer.js` | `document.body.appendChild(renderer.domElement)` |
| `camera.js` | `window.innerWidth/innerHeight` |
| `capsulePool.js` | Three.js objects (scene.add) |
| `mesh.js` | Three.js geometry/material |
| `stage.js` | Three.js scene lifecycle + DOM cleanup |

### ❌ GUI layer has DOM coupling

| Module | DOM access? |
|---|---|
| `controlManager.js` | `document.getElementById('pane')`, Tweakpane |
| `sessionTab.js` | `document.createElement('input')` for file loading |
| `signallingTab.js` | File input + `eval()` |
| `visualizationTab.js` | Tweakpane bindings |
| `dataProcessor.js` | **No** — pure JSON parsing (can go in worker) |

---

## 5. Proposed Message Topics

### Worker → Windows (published by SharedWorker)

| Topic | Payload | Rate | Consumer(s) |
|---|---|---|---|
| `state:bacteria` | `bacteriaDataUpdated` — array of {id,x,y,angle,longAxis,phenotype,cytoplasmConcentrations} | every step | 3D scene window |
| `state:concentrations` | `concentrations[selectedSpecies].conc` — Float64Array (6000 elements for 100×60 grid) | every step | 3D scene window (mesh), could also go to a dedicated heatmap window |
| `state:histories` | `{means, stdDevs}` — arrays of arrays | every step | Plot window |
| `state:overlay` | `{currentTimeStep, numberOfTimeSteps, fromStepToMinutes, totalAimPSpace, totalAimPTime}` | every step | Overlay/stats window |
| `state:coloringRule` | `coloringRule` object | on change | 3D scene + Plot windows |
| `state:simFinished` | `{}` | once | Controller |

### Windows → Worker (commands from GUI)

| Topic | Payload | Sender |
|---|---|---|
| `command:start` | `{}` | Controller |
| `command:pause` | `{}` | Controller |
| `command:reset` | `{}` | Controller |
| `command:stepForward` | `{}` | Controller |
| `command:setParam` | `{paramName, value}` | Controller |
| `command:setVarsAndParams` | `{vars, params}` | Controller |
| `command:init` | `{processedData}` — the parsed JSON + equations | Controller |
| `command:selectSpecies` | `{speciesName}` | Controller (or viz window) |
| `command:setBacteriaColor` | `{species, color}` | Controller |

---

## 6. What Moves Where

```
┌──────────────────── SharedWorker ────────────────────┐
│  config.js                                           │
│  state/stateManager.js                               │
│  simulation/simulationManager.js                     │
│  simulation/signallingNetwork/*  (entire tree)       │
│  GUI/dataProcessor.js  (JSON parsing)                │
│  animate loop (requestAnimationFrame → setInterval)  │
│  getGlobalSpeciesConcentrations                      │
│  updateData / updateHistories                        │
└──────────────────────────────────────────────────────┘

┌──────────── Controller Window ───────────────────────┐
│  GUI/controlManager.js                               │
│  GUI/sessionTab.js (file loading stays in window)    │
│  GUI/signallingTab.js (file loading + eval)          │
│  GUI/visualizationTab.js                             │
│  Posts commands to worker                            │
│  Opens dashboard windows                             │
└──────────────────────────────────────────────────────┘

┌──────────── 3D Scene Window ─────────────────────────┐
│  scene/graphicsManager.js                            │
│  scene/sceneComponents/* (entire tree)               │
│  Receives: state:bacteria, state:concentrations      │
└──────────────────────────────────────────────────────┘

┌──────────── Plot Window ─────────────────────────────┐
│  scene/plot.js                                       │
│  scene/plotOptions.js                                │
│  scene/graphycLibrariesImports.js (Chart only)       │
│  Receives: state:histories                           │
└──────────────────────────────────────────────────────┘

┌──────────── Stats/Overlay Window ────────────────────┐
│  scene/overlay.js                                    │
│  Receives: state:overlay                             │
└──────────────────────────────────────────────────────┘
```

---

## 7. Risks & Gotchas

1. **`eval()` in signallingTab.js** — the loaded equations file sets `window.vars` and `window.params` which contain **function references** (`vars.int[species].eq`, `vars.int[species].val`). Functions cannot be serialized across worker boundaries via `postMessage`. **Solution**: the controller window must `eval()` the equations file and serialize only the initial numeric values + equation source strings. The worker would reconstruct the functions from source strings.

2. **`bacteriaTimeSeries` is large** — potentially thousands of timesteps × thousands of bacteria. Loading the JSON happens in the controller window (file input), then the entire dataset must be transferred to the worker. **Solution**: use `Transferable` objects or just accept the one-time serialization cost at init.

3. **`concentrations[species].conc` is a Float64Array** (6000 elements). Sending it every step is cheap with `Transferable`, but then the worker loses the reference. **Solution**: either clone before sending, or double-buffer.

4. **`requestAnimationFrame` doesn't exist in workers** — the simulation loop currently uses rAF. In the worker, switch to `setInterval(tick, targetMs)` or use a self-adjusting timer.

5. **`bacteriaDataUpdated` contains per-bacterium cytoplasm objects** — could be hundreds of bacteria × N species. For the 3D scene this is the heaviest payload. Consider reducing to only the fields the 3D scene needs (x, y, angle, longAxis, color), and computing color in the worker.

6. **Topic filtering** — each dashboard should subscribe only to the topics it needs, so the worker doesn't waste time serializing data for windows that won't use it.

---

## 8. Recommended Phase 1 Order

1. Create `simulation-worker.js` — move simulation loop + state into it
2. Create `worker-client.js` — shared connection helper (already have this pattern from demo)
3. Create `main.js` router — `?role=controller|dashboard&view=3d|plot|overlay`
4. Wire controller window — Tweakpane GUI sends commands to worker
5. Wire 3D scene window — receives `state:bacteria` + `state:concentrations`
6. Wire plot window — receives `state:histories`
7. Wire stats window — receives `state:overlay`
8. Handle equation loading (the `eval()` problem)
