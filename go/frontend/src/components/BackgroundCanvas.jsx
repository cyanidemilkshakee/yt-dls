import { useEffect, useRef } from 'react';

export default function BackgroundCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let scene, camera, renderer, sphere;
    let _animFrameId = null;
    let _animRunning = false;
    let _lowPerfMode = false;
    
    // Read preference
    const saved = localStorage.getItem('yt-dls-low-perf-mode');
    if (saved === 'true') {
      _lowPerfMode = true;
      if (canvasRef.current) canvasRef.current.style.display = 'none';
      return;
    }

    if (typeof THREE === 'undefined') {
      console.warn('Three.js not loaded, skipping 3D background');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

      const geometry = new THREE.IcosahedronGeometry(4, 1);
      const isDark = document.documentElement.className.includes('dark');
      const material = new THREE.MeshBasicMaterial({ color: isDark ? 0x00ff99 : 0x0099ff, wireframe: true });
      sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
      camera.position.z = 8;

      const _tick = () => {
        if (!_animRunning || !sphere || !renderer || !scene || !camera) return;
        _animFrameId = requestAnimationFrame(_tick);
        sphere.rotation.x += 0.0005;
        sphere.rotation.y += 0.0005;
        renderer.render(scene, camera);
      };

      const _startAnimation = () => {
        if (_animRunning || _lowPerfMode) return;
        _animRunning = true;
        _tick();
      };

      const _stopAnimation = () => {
        _animRunning = false;
        if (_animFrameId !== null) {
          cancelAnimationFrame(_animFrameId);
          _animFrameId = null;
        }
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          _stopAnimation();
        } else if (!_lowPerfMode) {
          _startAnimation();
        }
      };
      
      let _resizeTimer = null;
      const handleResize = () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
          if (!camera || !renderer) return;
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }, 100);
      };

      // Observe theme changes to update color
      const observer = new MutationObserver(() => {
        if (!sphere) return;
        const isDarkNow = document.documentElement.className.includes('dark');
        sphere.material.color.setHex(isDarkNow ? 0x00ff99 : 0x0099ff);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('resize', handleResize);
      _startAnimation();

      return () => {
        _stopAnimation();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('resize', handleResize);
        observer.disconnect();
        if (renderer) renderer.dispose();
        if (sphere) {
          sphere.geometry.dispose();
          sphere.material.dispose();
        }
      };
    } catch (e) {
      console.error('Error init background', e);
    }
  }, []);

  return <canvas id="bg-canvas" ref={canvasRef}></canvas>;
}
