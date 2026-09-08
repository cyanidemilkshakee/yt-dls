import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import ThemeToggle from './components/ThemeToggle';
import BackgroundCanvas from './components/BackgroundCanvas';
import Home from './pages/Home';
import FFmpeg from './pages/FFmpeg';
import Settings from './pages/Settings';
import Donate from './pages/Donate';
import About from './pages/About';
import PageTransition from './components/PageTransition';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Home /></PageTransition>} />
        <Route path="/ffmpeg" element={<PageTransition><FFmpeg /></PageTransition>} />
        <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
        <Route path="/donate" element={<PageTransition><Donate /></PageTransition>} />
        <Route path="/about" element={<PageTransition><About /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  return (
    <Router>
      <BackgroundCanvas />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <motion.main 
        layout
        initial={false}
        animate={{ marginLeft: sidebarCollapsed ? '6rem' : '16rem' }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        id="main-content-wrapper" 
        className="relative flex-grow p-4 sm:p-6 lg:p-8"
      >
        <ThemeToggle />
        <AnimatedRoutes />
      </motion.main>
    </Router>
  );
}

export default App;
