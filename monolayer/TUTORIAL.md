# Tutorial: running several simulations in parallel and making heatmaps

This tutorial shows two ways to run several monolayer simulations at the same
time and how to turn their output into heatmaps with the thesis script
`scripts/heatmap.py`:

- **In the browser** (Part A): you watch the simulations while they run, and
  the browser downloads their states as JSON files.
- **Headless, from the terminal** (Part B): `npm run batch` runs a whole
  parameter sweep with replicates, without a browser, and writes everything to
  a folder.

Use the browser to explore and to look at a few runs; use the batch runner to
produce data: it is reproducible, faster to set up for many runs, and it
records how every run was made.

The examples use these paths, adjust them to your machine:

| What | Path |
|---|---|
| Engine | `~/Desktop/Repos/sharedWorkers/monolayer` |
| Equations files (tangled from the thesis) | `~/Desktop/Repos/EncryptedThesis/ODE/` |
| Trajectory data | `~/Desktop/Repos/DataParser/CompressedStates/LowRes.json` |
| Heatmap script and its Python | `~/Desktop/Repos/EncryptedThesis/scripts/heatmap.py`, `~/Desktop/Repos/EncryptedThesis/.venv/bin/python` |
| Working folder for results (any folder outside the repositories) | `~/Desktop/simulation-runs/` |

---

## 0. Before you start

1. The features of this tutorial are on the branch `simulation-runs`:

   ```bash
   cd ~/Desktop/Repos/sharedWorkers
   git switch simulation-runs
   ```

2. Install the engine's dependencies (once):

   ```bash
   cd ~/Desktop/Repos/sharedWorkers/monolayer
   npm install
   ```

3. The equations files in `EncryptedThesis/ODE/` are generated from the thesis
   chapters. If the folder is empty or outdated, regenerate them:

   ```bash
   cd ~/Desktop/Repos/EncryptedThesis
   .venv/bin/entangled tangle
   ```

   For the sender–receiver circuit use `ODE/sender-receiver.js`, for quorum
   sensing `ODE/quorum-sensing.js`.

4. Create the working folder for the results:

   ```bash
   mkdir -p ~/Desktop/simulation-runs
   ```

---

## 1. Concepts

- **A simulation is a named worker.** Every simulation runs in its own
  background thread (a SharedWorker) and is identified by its name, e.g. `1`,
  `2`, `K350-a`. Several simulations therefore really run in parallel, one per
  CPU core. Names are unique: the controller does not let you create two
  simulations with the same name.
- **The seed** fixes the random choices in the equations file, above all which
  cells start as producers and which as receivers. The same seed with the same
  files and parameters gives exactly the same run. *Initialize* and *Reset*
  always restart from the seed shown in the pane.
- **A clone is a replicate.** *Clone Simulation* creates a new simulation with
  the same equations, trajectory data, parameter values (including the ones
  you changed with the sliders), settings and bacteria colours (tab
  *Visualization*), but a **new seed**, i.e. a new
  random producer/receiver labelling. Change the clone's parameters if you want
  a parameter variant instead of a replicate.
- **What is saved.** Every saved state is one JSON file with all cells of one
  frame: position, cell type and all intracellular and extracellular
  concentrations. `heatmap.py` reads any number of such files — e.g. all
  downloads of several simulations — treats every file as one frame, and pools
  them into one heatmap per decay length.

---

## Part A — Several simulations in the browser

### A1. Start the engine

```bash
cd ~/Desktop/Repos/sharedWorkers/monolayer
npm run dev
```

Vite prints an address, usually `http://localhost:5173/`. Open it in
**Chrome** (SharedWorkers are needed). This page is the **controller**.
Firefox works as well, but in our benchmark Chrome ran the simulations about
10–25 % faster and used less memory, so Chrome is recommended. In Firefox, the
download setting below is *Settings → General → Downloads → "Always ask you
where to save files"*.

Chrome downloads every saved state as a separate file. Prepare Chrome once:

- In *Settings → Downloads*, turn **off** "Ask where to save each file before
  downloading", otherwise Chrome opens a dialog for every saved state.
- The first time the page saves several files, Chrome asks whether
  `localhost` may *download multiple files*: click **Allow**.

### A2. Create the first simulation

1. The page asks for a name; accept `1` or type your own.
2. In the pane *Simulation 1*, tab **Execution**, folder *Simulate from
   Precomputed Trajectories*:
   - **Load equations file** → `EncryptedThesis/ODE/sender-receiver.js`
   - **Load trajectory data** → `DataParser/CompressedStates/LowRes.json`
     (the page is busy for about 3 s while it reads and packs the file; this
     happens only once, clones reuse the packed data).
3. Optional, tab **Parameters**: change parameter values with the sliders.
4. Folder *Data Collection*: the **Saving frequency** slider sets how many
   frames pass between two saved states (default 40). Saving is on by default;
   *Stop Saving* / *Start Saving* switch it off and on. Smaller values give
   more frames for the heatmaps, and more files.
5. Folder *Manage Simulation*: the **Seed** field shows this simulation's seed.
   Type a number to choose it, or press **🎲 New seed** for a random one. Write
   down the seed if you want to reproduce the run later (it is also part of
   every saved file's name, see A5).
6. Press **🚀 Initialize**. The simulation starts running immediately.
   *Run / Pause* pauses and resumes it, *Step Forward* advances one frame,
   *Reset* restarts it from the first frame with the same seed.

### A3. Add more simulations running in parallel

**Replicates (same parameters, different random labelling):** in the pane of
simulation 1, press **⎘ Clone Simulation**, accept the suggested name (`2`).
A new pane appears with the same files, parameter values and bacteria colours,
and a new seed.
Press **Initialize** in the new pane. Repeat for more replicates.

**Parameter variants:** clone as above, then, in the clone's **Parameters**
tab, change the value (e.g. `K`), and press **Initialize**. Give such clones
names that say what they are, e.g. `K350` and `K750`.

**Completely different setups:** a clone always starts from the files of its
source. To load other files, load them in the clone's pane before pressing
Initialize (loading a new equations file resets the parameter sliders to the
file's values).

How many simulations to run at once: each one keeps one physical CPU core
busy. The browser counts hardware threads, usually two per physical core, and
a simulation gains little from the second thread of a core. On this machine
(6 cores, 12 threads) 5 simulations run at about 1 frame/s each, 11 at only
about 0.55 frames/s each: about 6 frames/s in total either way. When a page
already runs half as many simulations as the browser reports threads (6 here),
it asks for confirmation before creating another one. Each simulation keeps
its own copy of the packed trajectory data (about 0.17 GB for LowRes.json); all
simulations of a tab share Chrome's ≈4 GB JavaScript memory, which in principle
leaves room for about 20 (tested with up to 11). For more runs, or to use all
cores without a browser, use the batch runner (Part B).

### A4. Watch the simulations

In a simulation's pane, tab **Dashboards**, open the *3D Scene*, *Plot*,
*Monitor* and *Phase Portrait* windows. Every simulation gets its own windows,
so you can place the 3D scenes of two simulations side by side.

Keep the controller tab open: closing it stops all simulations it created.

**Attaching from another window.** If you open the controller address in a
second tab and type the name of a simulation that is already running, the page
asks whether to *attach* to it. Attaching gives you a second set of controls
for the same simulation, e.g. on a second screen; closing that tab does not stop
the simulation. To create a new simulation instead, choose another name.

### A5. Collect the saved states

The files arrive in your Downloads folder, named

```
<simulation name>_seed-<seed>_bacteria_state_<date and time>.json
```

e.g. `2_seed-1832746551_bacteria_state_2026-10-22T15-02-11-123Z.json`. Each
file is one frame of one simulation. There is nothing to sort: `heatmap.py`
reads the files directly from the download folder, all of them or only those of
the simulations you choose (A6). If Chrome saves downloads somewhere else (its
*Settings → Downloads → Location*), use that folder instead of `~/Downloads`
below.

### A6. Make the heatmaps of the browser runs

`heatmap.py` accepts any number of files and folders and pools all of them into
**one heatmap per decay length** (λ = 2.0, 2.5, 3.0, 3.5 µm). Every file stays a
frame of its own, so cells of different simulations are never counted as
neighbours. `--out` chooses the folder for the heatmaps.

**All simulations together:**

```bash
PY=~/Desktop/Repos/EncryptedThesis/.venv/bin/python
HEATMAP=~/Desktop/Repos/EncryptedThesis/scripts/heatmap.py

"$PY" "$HEATMAP" ~/Downloads/*_bacteria_state_*.json \
    --overlay sender-receiver --out ~/Desktop/simulation-runs/heatmaps-all
```

**Only some simulations**, selected by the name at the start of the file names
(the `_` after the name keeps `2` from also matching `21`):

```bash
# simulation 2 alone
"$PY" "$HEATMAP" ~/Downloads/2_seed-*_bacteria_state_*.json \
    --overlay sender-receiver --out ~/Desktop/simulation-runs/heatmaps-sim2
# simulations 1, 2 and 3
"$PY" "$HEATMAP" ~/Downloads/{1,2,3}_seed-*_bacteria_state_*.json \
    --overlay sender-receiver --out ~/Desktop/simulation-runs/heatmaps-1-3
```

The script prints how many frames and cells it read, the intensity range, and
the name of each heatmap it writes:
`heatmap_fluorescence_vs_local_proportion(rfp, Lambda=….png`.

Pool only simulations of the same model and parameters (e.g. replicates made
with *Clone Simulation*): the heatmap cannot tell a parameter variant from a
replicate. Give parameter variants their own names (e.g. `K350`, `K750`) and
select them by name as above. See *Heatmap options* below for the other flags,
e.g. `--scale 750` for the nondimensional equations files.

---

## Part B — A batch of simulations in the terminal (headless)

### B1. Write a configuration file

A configuration describes all runs of a batch: the files, the frames to
simulate, the parameter sweep and the seeds. Save this as
`~/Desktop/simulation-runs/batch/K-sweep.json`:

```json
{
    "equations": "/home/ricardo/Desktop/Repos/EncryptedThesis/ODE/sender-receiver.js",
    "data": "/home/ricardo/Desktop/Repos/DataParser/CompressedStates/LowRes.json",
    "outDir": "K-sweep",
    "frames": { "start": 1, "end": 400 },
    "saveEvery": 10,
    "saveFrom": 200,
    "params": { "Kdeg": 0.00166 },
    "sweep": { "K": [350, 750] },
    "seeds": [1, 2, 3]
}
```

| Field | Meaning |
|---|---|
| `equations`, `data` | The equations file and the trajectory data. Relative paths are relative to the configuration file. |
| `outDir` | Folder for the results, relative to the configuration file. Default `batch-output`. |
| `frames` | First frame and the frame after the last one: `{ "start": 1, "end": 400 }` simulates frames 1–399. Default: frame 1 to the end of the data (4014 frames for LowRes.json). |
| `saveEvery` | Save every n-th frame (and always the last one). Default 40. |
| `saveFrom` | Save frames only from this frame on. The frames before are still simulated — the system needs them to reach steady state — but not saved, so the heatmaps leave out the transient. All concentrations start at 1, and the reporter settles with a time constant of about 65 min (≈37 frames), so it is within about 5 % of steady state after ≈110 frames (≈3 h); 120–200 is a good value. Default: save from the first frame. |
| `params` | Parameter values that replace those of the equations file in **all** runs. Optional. |
| `sweep` | Parameters to vary. Every combination of the listed values is run: `{ "K": [350, 750], "P_R": [0.1, 0.2] }` gives 4 combinations. Optional. |
| `seeds` | A list of seeds (one replicate per seed), or a number n for n random seeds. Default 1 random seed. |
| `maxParallel` | How many runs at the same time. Default: half the number of hardware threads, i.e. about one per physical core (6 on a 6-core/12-thread machine); more parallel runs add almost no speed. |

The example makes 2 values of `K` × 3 seeds = **6 runs**, all at the same time
(the default allows 6 in parallel on this machine).
Parameter names must exist in the equations file; a misspelled name stops the
run with an error.

### B2. Run the batch

```bash
cd ~/Desktop/Repos/sharedWorkers/monolayer
npm run batch -- ~/Desktop/simulation-runs/batch/K-sweep.json
```

The runner reads the trajectory data once (a few seconds for LowRes.json),
then prints a line per saved frame and one per finished run:

```
Reading /home/ricardo/Desktop/Repos/DataParser/CompressedStates/LowRes.json …
6 run(s) × 399 frames (101.6 s per frame), 6 in parallel → /home/ricardo/Desktop/simulation-runs/batch/K-sweep; saving from frame 200
  K=350_seed=1: frame 200 (200/399)
  …
✓ K=350_seed=1 (560 s)
…
All runs finished.
```

On this machine each run takes about 1.1 s per frame (≈1000 cells) when it runs
alone and about 1.4 s per frame with 6 runs in parallel, so the 6 runs of the
example over frames 1–399 finish together after about 9 minutes, and a run over
all 4014 frames takes about 1.5 hours. Try a configuration with `"end": 21`
(and `"saveFrom": 10`, which must lie within the simulated frames) first to
check everything in about half a minute.

### B3. What the batch writes

```
batch/K-sweep/
├── K=350_seed=1/
│   ├── run.json               ← how this run was made
│   └── frames/
│       ├── frame_000200.json  ← all cells of frame 200 (the first saved, saveFrom)
│       ├── frame_000210.json
│       └── …
├── K=350_seed=2/
├── …
└── K=750_seed=3/
```

`run.json` records everything needed to reproduce the run: the equations and
data files, the full parameter set, the overrides of this run, the seed, the
frames, the seconds per frame, and the git commit of the engine (marked *with
uncommitted changes* if the engine had local modifications). Running the same
configuration again gives byte-identical frames.

### B4. Make the heatmaps of the batch

Pass the `frames` folders of the runs to pool; wildcards select them by run
name. One heatmap per parameter value, pooling all its replicates (seeds):

```bash
cd ~/Desktop/simulation-runs/batch
PY=~/Desktop/Repos/EncryptedThesis/.venv/bin/python
HEATMAP=~/Desktop/Repos/EncryptedThesis/scripts/heatmap.py

for K in 350 750; do
    "$PY" "$HEATMAP" K-sweep/K=${K}_seed=*/frames \
        --overlay sender-receiver --out heatmaps/K=$K
done
```

This writes `heatmaps/K=350/` and `heatmaps/K=750/`, each with one heatmap per
decay length. A single run works the same way, e.g.
`"$PY" "$HEATMAP" K-sweep/K=750_seed=1/frames --out heatmaps/K=750_seed=1`.
Remember that the `sender-receiver` overlay is drawn for `K = 750` (see
*Heatmap options*).

---

## Heatmap options

```bash
"$PY" "$HEATMAP" --help
```

| Argument / flag | Meaning |
|---|---|
| files and folders | The saved frames to pool: JSON files, folders of JSON files, or wildcards. Default: the current folder. JSON files that are not saved frames are skipped. |
| `--out DIR` | Folder for the heatmaps (default `heatmaps` in the current folder). |
| `--overlay sender-receiver` / `quorum-sensing` / `sender-receiver-positive` / `none` | The predicted response drawn over the heatmap. `sender-receiver-positive` is for `ODE/sender-receiver-positive.js` (the switch): it draws the OFF and ON branches and, dashed, the unstable branch between them; both stable branches exist for local receiver proportions between ≈0.35 and 0.84. |
| `--yscale log` / `linear` | Binning and axis of the fluorescence (default log). |
| `--scale`, `--offset` | Calibration to the experimental units: intensity = scale · value + offset (e.g. `--scale 4.15 --offset -100`). |
| `--max-frames N` | Use only the first N files read (default: all). |

The decay lengths of the heatmaps are set by `DECAY_LENGTHS` at the top of the
script (λ = 2.0, 2.5, 3.0, 3.5 µm); all of them are computed in one pass over
the frames.

**Nondimensional equations files** (`ODE/*-nd.js`, e.g.
`monotonic-decreasing-nd.js`) measure concentrations in units of the Hill
constant `K`, so their reporter values are 750 times smaller than those of
`sender-receiver.js` (about 0.06–0.6 instead of 47–460 molec/µm²). Add
`--scale 750` (`--scale 350` for the quorum-sensing files) to convert them to
molec/µm²; then the overlay curve lies on the data. You can tell the files
apart by the species: the reduced nondimensional model has no complex `C`.

The overlays use the Hill constant of the thesis' canonical circuits: `K = 750`
for `sender-receiver`, `K = 350` for `quorum-sensing` and `K = 65` for
`sender-receiver-positive`. For runs with another
`K` (as in the K-sweep), the drawn curve does not correspond to the simulated
`K`; use `--overlay none` for those runs or keep in mind that only the matching
run has the right curve.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "A simulation named … already exists in this window." | Names are unique per controller; take the suggested name. |
| "A simulation named … is already running in another window. Attach to it?" | Another tab runs a simulation with this name. *OK* attaches to it; *Cancel* lets you choose another name. |
| The tab freezes and no simulation advances | All simulations of a tab share Chrome's ≈4 GB of JavaScript memory; with very large trajectory files or very many simulations it runs out (the browser console or Chrome's log shows `V8 javascript OOM`). Close the tab, reopen it and run fewer simulations, or use the batch runner. |
| Only the first saved state is downloaded | Chrome blocked the further downloads: click the blocked-download icon in the address bar and allow multiple downloads for `localhost`. |
| A save dialog opens for every file | Turn off "Ask where to save each file before downloading" in Chrome's download settings. |
| `The equations file must define params.TIME_SCALE_SECONDS` (batch) | Old equations files lack this parameter; use the files tangled from the thesis (`EncryptedThesis/ODE/`). |
| `Unknown parameter(s) in the run configuration: …` (batch) | A name in `params` or `sweep` does not exist in the equations file (names are case-sensitive). |
| `JavaScript heap out of memory` (batch) | The runner holds the parsed trajectory data in memory once (the npm script allows 8 GB). Lower `maxParallel` or use a smaller data file. |
| `🛑 FIRST NaN/Inf DETECTED` in the browser console or the terminal | A concentration became NaN or infinite; the message names the stage, species, cell and parameters where it happened. Check the parameter values of that run. |
| `npm audit fix` fails with `Cannot read properties of null (reading 'edgesOut')` | A bug of npm 10 with the Vitest packages, not a problem of the project; `npm install` is not affected and is all the tutorial needs. To apply audit fixes, use a newer npm without installing it: `npx -y npm@12 audit fix`. |
| `heatmap.py`: `Skipped … JSON file(s) that are not saved frames` | Harmless: other JSON files (e.g. a batch run's `run.json`) were among the inputs and were ignored. |
| `heatmap.py`: `No cells found in …` (older versions: `IndexError: index 0 is out of bounds`) | The files or folders you passed hold no saved frames: check the path and the wildcard, e.g. `~/Downloads/*_bacteria_state_*.json`, or pass a run's `frames` folder. |
| The shell says `no matches found` or `No such file or directory` for the wildcard | No file matches the pattern: check the download folder and the simulation name in the pattern. |
