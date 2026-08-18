/**
 * background.js — Three.js 3D background
 *
 * Optimisations applied:
 *  1. Visibility pause — animation loop is cancelled when the browser tab is
 *     hidden (document.visibilitychange) and restarted when it becomes visible
 *     again. Zero GPU cost while the user is on another tab.
 *  2. Low Performance Mode — setLowPerformanceMode(true) destroys the WebGL
 *     context and removes the canvas. Can be toggled from settings.
 *  3. Debounced resize handler — resize events fire every pixel during a window
 *     drag; debounce at 100 ms prevents layout thrashing.
 */

let scene, camera, renderer, sphere;
let _animFrameId  = null;   // requestAnimationFrame handle
let _animRunning  = false;
let _lowPerfMode  = false;

// ─── Initialise ───────────────────────────────────────────────────────────────
export function initBackground() {
    if (typeof THREE === 'undefined') {
        console.warn('Three.js not loaded, skipping 3D background');
        return false;
    }

    const canvas = document.getElementById('bg-canvas');
    if (!canvas) {
        console.warn('Background canvas not found');
        return false;
    }

    // Respect saved low-performance preference
    const saved = localStorage.getItem('yt-dls-low-perf-mode');
    if (saved === 'true') {
        _lowPerfMode = true;
        canvas.style.display = 'none';
        return false;
    }

    try {
        scene    = new THREE.Scene();
        camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap pixel ratio

        const geometry = new THREE.IcosahedronGeometry(4, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff99, wireframe: true });
        sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);
        camera.position.z = 8;

        _setupVisibilityHandler();
        _setupResizeHandler();
        _startAnimation();

        console.log('3D background initialised');
        return true;
    } catch (error) {
        console.error('Error initialising 3D background:', error);
        return false;
    }
}

// ─── Animation ────────────────────────────────────────────────────────────────
function _startAnimation() {
    if (_animRunning || _lowPerfMode) return;
    _animRunning = true;
    _tick();
}

function _stopAnimation() {
    _animRunning = false;
    if (_animFrameId !== null) {
        cancelAnimationFrame(_animFrameId);
        _animFrameId = null;
    }
}

function _tick() {
    if (!_animRunning || !sphere || !renderer || !scene || !camera) return;
    _animFrameId = requestAnimationFrame(_tick);
    sphere.rotation.x += 0.0005;
    sphere.rotation.y += 0.0005;
    renderer.render(scene, camera);
}

// ─── Visibility handler — pause when tab is hidden ───────────────────────────
function _setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            _stopAnimation();
        } else if (!_lowPerfMode) {
            _startAnimation();
        }
    });
}

// ─── Debounced resize handler ─────────────────────────────────────────────────
function _setupResizeHandler() {
    let _resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            if (!camera || !renderer) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }, 100);
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Toggle low-performance mode (destroys/restores WebGL context). */
export function setLowPerformanceMode(enabled) {
    _lowPerfMode = enabled;
    localStorage.setItem('yt-dls-low-perf-mode', String(enabled));

    const canvas = document.getElementById('bg-canvas');

    if (enabled) {
        _stopAnimation();
        // Dispose WebGL resources
        if (renderer) {
            renderer.dispose();
            renderer.forceContextLoss();
            renderer = null;
        }
        if (sphere) {
            sphere.geometry.dispose();
            sphere.material.dispose();
            sphere = null;
        }
        scene  = null;
        camera = null;
        if (canvas) canvas.style.display = 'none';
    } else {
        if (canvas) canvas.style.display = '';
        initBackground();
    }
}

/** Update sphere colour when theme changes. */
export function updateBackgroundTheme(isDark) {
    if (!sphere) return;
    sphere.material.color.setHex(isDark ? 0x00ff99 : 0x0099ff);
}

/** Full resource cleanup (called on page unload). */
export function cleanup() {
    _stopAnimation();
    if (renderer)  { renderer.dispose(); renderer = null; }
    if (sphere)    { sphere.geometry.dispose(); sphere.material.dispose(); sphere = null; }
    scene  = null;
    camera = null;
}

export function isInitialized() {
    return !!(scene && camera && renderer && sphere);
}

export function isLowPerformanceMode() {
    return _lowPerfMode;
}
