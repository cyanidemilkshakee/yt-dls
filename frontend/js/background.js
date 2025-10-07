// 3D Background using Three.js

let scene, camera, renderer, sphere;

// Initialize 3D background
export function initBackground() {
    // Check if Three.js is available
    if (typeof THREE === 'undefined') {
        console.warn('Three.js not loaded, skipping 3D background');
        return false;
    }

    const canvas = document.getElementById('bg-canvas');
    if (!canvas) {
        console.warn('Background canvas not found');
        return false;
    }

    try {
        // Create scene
        scene = new THREE.Scene();
        
        // Create camera
        camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        
        // Create renderer
        renderer = new THREE.WebGLRenderer({ 
            canvas: canvas, 
            alpha: true 
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Create geometry and material
        const geometry = new THREE.IcosahedronGeometry(4, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ff99, 
            wireframe: true 
        });
        
        // Create mesh
        sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);
        
        // Position camera
        camera.position.z = 8;
        
        // Start animation loop
        animate();
        
        // Setup resize handler
        setupResizeHandler();
        
        console.log('3D background initialized successfully');
        return true;
        
    } catch (error) {
        console.error('Error initializing 3D background:', error);
        return false;
    }
}

// Animation loop
function animate() {
    if (!sphere || !renderer || !scene || !camera) {
        return;
    }
    
    requestAnimationFrame(animate);
    
    // Rotate sphere
    sphere.rotation.x += 0.0005;
    sphere.rotation.y += 0.0005;
    
    // Render scene
    renderer.render(scene, camera);
}

// Handle window resize
function setupResizeHandler() {
    window.addEventListener('resize', () => {
        if (!camera || !renderer) return;
        
        // Update camera aspect ratio
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        
        // Update renderer size
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Update sphere color based on theme
export function updateBackgroundTheme(isDark) {
    if (!sphere) return;
    
    const color = isDark ? 0x00ff99 : 0x0099ff;
    sphere.material.color.setHex(color);
}

// Cleanup resources
export function cleanup() {
    if (renderer) {
        renderer.dispose();
    }
    if (sphere) {
        sphere.geometry.dispose();
        sphere.material.dispose();
    }
    scene = null;
    camera = null;
    renderer = null;
    sphere = null;
}

// Check if background is initialized
export function isInitialized() {
    return !!(scene && camera && renderer && sphere);
}
