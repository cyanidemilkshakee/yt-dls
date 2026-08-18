import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ThemeToggle from './components/ThemeToggle';
import BackgroundCanvas from './components/BackgroundCanvas';
import Home from './pages/Home';
import FFmpeg from './pages/FFmpeg';
import Settings from './pages/Settings';
import Donate from './pages/Donate';
import About from './pages/About';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  return (
    <Router>
      <BackgroundCanvas />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main 
        id="main-content-wrapper" 
        className="relative flex-grow p-4 sm:p-6 lg:p-8 transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? '6rem' : '16rem' }}
      >
        <ThemeToggle />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ffmpeg" element={<FFmpeg />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
