import { updateBackgroundTheme } from './background.js';

// Theme and sidebar management
let sidebarPinned = false;

// Initialize UI controls
export function initUIControls() {
    initThemeToggle();
    initSidebar();
}

// Initialize theme toggle functionality
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');
    const htmlEl = document.documentElement;

    if (!themeToggle || !darkIcon || !lightIcon) {
        console.warn('Theme toggle elements not found');
        return;
    }

    // Set theme function
    function setTheme(theme) {
        localStorage.setItem('theme', theme);
        
        // Add smooth transition class
        document.body.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        
        if (theme === 'dark') {
            htmlEl.classList.add('dark');
            htmlEl.classList.remove('light');
            
            themeToggle.className = 'p-3 rounded-full transition-all duration-500 shadow-lg bg-white text-black hover:bg-gray-100 transform hover:scale-110';
            
            lightIcon.style.display = 'block';
            darkIcon.style.display = 'none';
            
        } else {
            htmlEl.classList.remove('dark');
            htmlEl.classList.add('light');
            
            themeToggle.className = 'p-3 rounded-full transition-all duration-500 shadow-lg bg-black text-white hover:bg-gray-800 transform hover:scale-110';
            
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        }
        
        // Update 3D background theme
        updateBackgroundTheme(theme === 'dark');
        
        // Remove transition after animation
        setTimeout(() => {
            document.body.style.transition = '';
        }, 600);
    }

    // Theme toggle click handler
    themeToggle.addEventListener('click', () => {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    // Initialize theme on page load
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
}

// Initialize sidebar functionality
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const mainContentWrapper = document.getElementById('main-content-wrapper');

    if (!sidebar || !collapseBtn || !mainContentWrapper) {
        console.warn('Sidebar elements not found');
        return;
    }

    // Set sidebar state
    function setSidebarState(collapsed) {
        if (collapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    // Add click event for collapse button
    collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        sidebarPinned = !sidebarPinned;
        
        if (sidebarPinned) {
            // If pinned, expand the sidebar
            setSidebarState(false);
        } else {
            // If unpinned, collapse the sidebar
            setSidebarState(true);
        }
    });

    // Expand sidebar on mouse enter (only if not pinned)
    sidebar.addEventListener('mouseenter', () => {
        if (!sidebarPinned) {
            setSidebarState(false);
        }
    });

    // Collapse sidebar on mouse leave (only if not pinned)
    sidebar.addEventListener('mouseleave', () => {
        if (!sidebarPinned) {
            setSidebarState(true);
        }
    });

    // Set sidebar to collapsed by default on page load (not pinned)
    sidebarPinned = false;
    setSidebarState(true);
}

// Get current theme
export function getCurrentTheme() {
    return localStorage.getItem('theme') || 'dark';
}

// Check if sidebar is pinned
export function isSidebarPinned() {
    return sidebarPinned;
}

// Toggle sidebar pin state
export function toggleSidebarPin() {
    sidebarPinned = !sidebarPinned;
    return sidebarPinned;
}
