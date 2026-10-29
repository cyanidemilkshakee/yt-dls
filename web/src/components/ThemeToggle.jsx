import { useState } from 'react';

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
    <div className="absolute top-6 right-6 z-10">
      <button 
        id="theme-toggle" 
        onClick={toggleTheme}
        type="button"
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        aria-pressed={isDark}
        className="theme-toggle p-3 rounded-full transition-colors duration-300"
      >
        {isDark ? (
          // Sun icon - shown in dark theme (light mode toggle)
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          // Moon icon - shown in light theme (dark mode toggle)
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </div>
  );
}
