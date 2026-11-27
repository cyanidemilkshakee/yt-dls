import { useEffect, useRef } from 'react';
import './HomeArtwork.css';

const fullTurn = 2 * Math.PI;
const sweepPaths = Array.from({ length: 19 }, (_, index) => {
  const spacing = index * 11;
  return `M -60 ${90 + spacing}
    C 88 ${140 + spacing} 130 ${204 + spacing / 2} 227 ${188 + spacing / 3}
    S ${338 + spacing / 2} ${-35 + spacing / 5} 660 ${-71 + spacing / 3}`;
});

function projectTorus(angle, tubeAngle) {
  const radius = 202 + 62 * Math.cos(tubeAngle);
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  const z = 62 * Math.sin(tubeAngle);
  return [
    (320 + x * 0.93 - y * 0.25).toFixed(1),
    (223 + x * 0.29 + y * 0.53 - z * 0.88).toFixed(1),
  ].join(' ');
}

function traceLoop(steps, pointAtAngle) {
  const points = Array.from({ length: steps }, (_, index) => pointAtAngle(fullTurn * index / steps));
  return `M ${points.join(' L ')} Z`;
}

const torusRingCount = 10;
const torusRings = Array.from({ length: torusRingCount }, (_, index) => {
  const tubeAngle = fullTurn * index / torusRingCount;
  return traceLoop(96, angle => projectTorus(angle, tubeAngle));
});

const torusSectionCount = 26;
const torusSections = Array.from({ length: torusSectionCount }, (_, index) => {
  const angle = fullTurn * index / torusSectionCount;
  return traceLoop(24, tubeAngle => projectTorus(angle, tubeAngle));
});

function traceWave(amplitude, phase) {
  const points = Array.from({ length: 121 }, (_, index) => {
    const x = index * 3;
    const envelope = Math.sin(Math.PI * x / 360) ** 2;
    const y = 64 + Math.sin(x * 0.115 + phase) * envelope * amplitude;
    return `${x} ${y.toFixed(1)}`;
  });
  return `M ${points.join(' L ')}`;
}

const wavePaths = [traceWave(37, 0), traceWave(26, 1.8), traceWave(17, 3.6)];

export default function HomeArtwork() {
  const artworkRef = useRef(null);

  useEffect(() => {
    const artwork = artworkRef.current;
    let pauseTimer;

    const keepMoving = () => {
      artwork.dataset.interacting = '';
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(() => {
        delete artwork.dataset.interacting;
      }, 3500);
    };

    window.addEventListener('pointerdown', keepMoving, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', keepMoving);
      window.clearTimeout(pauseTimer);
    };
  }, []);

  return (
    <div className="home-artwork" ref={artworkRef} aria-hidden="true">
      <svg className="home-artwork-sweep" data-art-motion="" viewBox="0 0 660 430" fill="none" stroke="currentColor">
        {sweepPaths.map((path, index) => (
          <path key={path} d={path} className={index % 6 === 0 ? 'home-artwork-emphasis' : undefined} />
        ))}
      </svg>
      <svg className="home-artwork-mesh" data-art-motion="" viewBox="0 0 640 450" fill="none" stroke="currentColor">
        <g opacity=".65">{torusSections.map(path => <path key={path} d={path} />)}</g>
        {torusRings.map(path => <path key={path} d={path} />)}
        <path className="home-artwork-trace home-artwork-emphasis" data-art-motion="" pathLength="100" d={torusRings[0]} />
      </svg>
      <svg className="home-artwork-orbit" data-art-motion="" viewBox="0 0 246 224" fill="none" stroke="currentColor">
        <circle cx="123" cy="112" r="81" strokeDasharray="1 7" />
        <circle cx="123" cy="112" r="66" />
        <circle cx="123" cy="112" r="24" opacity=".45" />
        <path d="M 123 13 V 29 M 123 195 V 211 M 24 112 H 40 M 206 112 H 222 M 114 112 H 132 M 123 103 V 121" />
        <g transform="rotate(-32 123 112)">
          <ellipse cx="123" cy="112" rx="112" ry="38" />
          <ellipse className="home-artwork-trace home-artwork-emphasis" data-art-motion="" pathLength="100" cx="123" cy="112" rx="112" ry="38" />
          <circle cx="38" cy="87" r="4" fill="currentColor" />
          <circle cx="216" cy="133" r="3" fill="currentColor" />
        </g>
      </svg>
      <svg className="home-artwork-wave" viewBox="-14 0 388 128" fill="none" stroke="currentColor">
        <path d="M 0 64 H 360" strokeDasharray="2 7" opacity=".56" />
        <path d="M 0 55 V 73 M 60 58 V 70 M 120 60 V 68 M 180 54 V 74 M 240 60 V 68 M 300 58 V 70 M 360 55 V 73" opacity=".56" />
        <g className="home-artwork-wave-lines" data-art-motion="">
          <path d={wavePaths[0]} className="home-artwork-emphasis" />
          <path d={wavePaths[1]} opacity=".7" />
          <path d={wavePaths[2]} opacity=".5" />
        </g>
        <path d="M -5 64 L 0 59 L 5 64 L 0 69 Z M 355 64 L 360 59 L 365 64 L 360 69 Z" />
      </svg>
    </div>
  );
}
