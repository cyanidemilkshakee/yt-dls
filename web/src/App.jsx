import { Component, lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import ThemeToggle from './components/ThemeToggle';
import PageTransition from './components/PageTransition';

const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const Donate = lazy(() => import('./pages/Donate'));
const About = lazy(() => import('./pages/About'));
const BackgroundCanvas = lazy(() => import('./components/BackgroundCanvas'));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <div className="card p-6" role="alert"><h1>Could not load this page</h1><p>{this.state.error.message}</p><button className="btn mt-3" onClick={() => location.reload()}>Reload</button></div>;
  }
}

function AnimatedRoutes() {
  const location = useLocation();
  return <AnimatePresence mode="wait"><ErrorBoundary key={location.pathname}><Suspense fallback={<div className="page-content" role="status">Loading page…</div>}><Routes location={location}>
    <Route path="/" element={<PageTransition><Home /></PageTransition>} />
    <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
    <Route path="/donate" element={<PageTransition><Donate /></PageTransition>} />
    <Route path="/about" element={<PageTransition><About /></PageTransition>} />
    <Route path="*" element={<div className="card p-6"><h1>Page not found</h1><Link className="btn mt-3" to="/">Back to Home</Link></div>} />
  </Routes></Suspense></ErrorBoundary></AnimatePresence>;
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [reduceEffects, setReduceEffects] = useState(() => {
    try {
      const stored = localStorage.getItem('yt-dls-low-perf-mode');
      if (stored !== null) return stored === 'true';
    } catch {}
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });
  useEffect(() => {
    const update = event => setReduceEffects(Boolean(event.detail));
    window.addEventListener('yt-dls-performance-change', update);
    return () => window.removeEventListener('yt-dls-performance-change', update);
  }, []);
  useEffect(() => {
    if (reduceEffects) {
      setBackgroundReady(false);
      return undefined;
    }

    let idleId;
    let timeoutId;
    let cancelled = false;
    const enableBackground = () => { if (!cancelled) setBackgroundReady(true); };
    if (window.requestIdleCallback) idleId = window.requestIdleCallback(enableBackground, { timeout: 1500 });
    else timeoutId = window.setTimeout(enableBackground, 900);

    return () => {
      cancelled = true;
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [reduceEffects]);
  useEffect(() => { document.documentElement.classList.toggle('reduce-effects', reduceEffects); }, [reduceEffects]);
  return <MotionConfig reducedMotion={reduceEffects ? 'always' : 'user'}><Router>
    <a href="#main-content-wrapper" className="skip-link">Skip to content</a>
    <div className="studio-background" aria-hidden="true">
      {!reduceEffects && backgroundReady && <ErrorBoundary fallback={null}><Suspense fallback={null}><BackgroundCanvas /></Suspense></ErrorBoundary>}
    </div>
    <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} />
    <motion.main initial={false} id="main-content-wrapper" tabIndex={-1} className="relative w-full min-w-0 mx-auto p-4 sm:p-6 lg:p-8">
      <ThemeToggle /><AnimatedRoutes />
    </motion.main>
  </Router></MotionConfig>;
}
