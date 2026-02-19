
export const CONFIG = {
    SCENE: {
        FOG_COLOR: 0x0f0000,
        FOG_NEAR: 5,
        FOG_FAR: 120,
        CAMERA_FOV: 75,
        CAMERA_NEAR: 5,
        CAMERA_FAR: 1000,
        CAMERA_POSITION: { x: 0, y: 0, z: 70 },
        CAMERA_LOOKAT: { x: 0, y: 0, z: 0 },
        CONTROLS_MAX_DISTANCE: 100,
        CONTROLS_MIN_DISTANCE: 20
    },
    BACTERIUM: {
        CAP_SEGMENTS: 1,
        RADIAL_SEGMENTS: 3,
        INITIAL_POOL_SIZE: 2000,
        POOL_GROWTH_FACTOR: 1.1,
        WIREFRAME_SCALE: 1.03,
        COLOR_BY_INHERITANCE: true,
    },
    GRID: {
        WIDTH: 100,
        HEIGHT: 60,
        dx: 1
    },
};
