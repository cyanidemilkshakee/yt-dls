import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

function InteractiveSphere() {
  const meshRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const elapsed = useRef(0);

  useEffect(() => {
    const handlePointerMove = event => {
      pointer.current.x = event.clientX / window.innerWidth - 0.5;
      pointer.current.y = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    elapsed.current += delta;
    mesh.rotation.x += (0.04 + pointer.current.y * 0.035) * delta;
    mesh.rotation.y += (0.065 + pointer.current.x * 0.05) * delta;
    mesh.scale.setScalar(1 + Math.sin(elapsed.current * 0.7) * 0.015);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[4, 2]} />
      <meshBasicMaterial color="#35c997" wireframe transparent opacity={0.25} depthWrite={false} />
    </mesh>
  );
}

export default function BackgroundCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 75 }}
      dpr={[1, 1.25]}
      gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
    >
      <InteractiveSphere />
    </Canvas>
  );
}
