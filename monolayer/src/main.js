/**
 * main.js — Router
 *
 * Reads URL query parameters to decide which view to mount:
 *   ?view=3d           → Three.js bacteria scene
 *   ?view=plot         → Chart.js time-series plot
 *   ?view=overlay      → Text stats overlay
 */

const params = new URLSearchParams(window.location.search);
const view = params.get('view'); 


if (view === '3d') {
    import('./views/scene-view.js').then(m => m.mountSceneView());
} else if (view === 'plot') {
    import('./views/plot-view.js').then(m => m.mountPlotView());
} else if (view === 'overlay') {
    import('./views/overlay-view.js').then(m => m.mountOverlayView());
} else {
    import('./views/controller-view.js').then(m => m.mountControllerView());
}
