import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import { useSpring, useMotionValue } from 'framer-motion';

function InteractiveSphere() {
  const meshRef = useRef();
  const time = useRef(0);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX / window.innerWidth - 0.5);
      mouseY.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += 0.001 + springY.get() * 0.01;
    meshRef.current.rotation.y += 0.0015 + springX.get() * 0.01;
    time.current += delta;
    const scale = 1 + Math.sin(time.current) * 0.02;
    meshRef.current.scale.set(scale, scale, scale);
  });

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[4, 2]} />
        <meshBasicMaterial
          color="#35c997"
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>
    </Float>
  );
}

export default function BackgroundCanvas() {
  const [lowPerf, setLowPerf] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('yt-dls-low-perf-mode') === 'true') {
      setLowPerf(true);
      return;
    }

  }, []);

  if (lowPerf) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    >
      <Canvas camera={{ position: [0, 0, 8], fov: 75 }} dpr={[1, 1.5]}>
        <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
        <InteractiveSphere />
      </Canvas>
    </div>
  );
}
