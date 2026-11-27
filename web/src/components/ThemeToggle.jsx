import { useState } from 'react';
import { FiMoon, FiSun } from 'react-icons/fi';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));


  const toggleTheme = () => {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle('dark', nextIsDark);
    document.documentElement.classList.toggle('light', !nextIsDark);
    try { localStorage.setItem('yt-dls-theme', nextIsDark ? 'dark' : 'light'); } catch {}
    setIsDark(nextIsDark);
  };

  return (
    <div className="theme-toggle-position">
      <button
        id="theme-toggle"
        onClick={toggleTheme}
        type="button"
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        aria-pressed={isDark}
        className="theme-toggle p-3 rounded-full transition-colors duration-300"
      >
        {isDark ? (
          <FiSun aria-hidden="true" className="h-7 w-7" />
        ) : (
          <FiMoon aria-hidden="true" className="h-7 w-7" />
        )}
      </button>
    </div>
  );
}
