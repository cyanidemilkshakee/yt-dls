import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

const iconPaths = {
  home: <><path d="m4 10 8-6 8 6" /><path d="M6 9v10h12V9M10 19v-6h4v6" /></>,
  settings: <><path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h9m4 0h3" /><circle cx="13" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
  donate: <path d="M20.8 8.6c0 5.1-8.8 10.6-8.8 10.6S3.2 13.7 3.2 8.6A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.2Z" />,
  about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
};

function SidebarIcon({ name }) {
  return <svg aria-hidden="true" focusable="false" className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function SidebarLink({ to, icon, label, exact = false, expanded }) {
  const location = useLocation();
  const isActive = exact ? location.pathname === to : (location.pathname.startsWith(to) && to !== '/') || (to === '/' && location.pathname === '/');
  const textVariants = {
    hidden: { opacity: 0, width: 0, marginLeft: 0 },
    visible: { opacity: 1, width: 'auto', marginLeft: 12, transition: { duration: 0.2 } },
  };

  return (
    <Link aria-label={label} title={!expanded ? label : undefined} aria-current={isActive ? 'page' : undefined} to={to} className={`sidebar-link ${isActive ? 'active' : ''} ${to === '/' ? 'mb-4' : ''}`}>
      {icon}
      <AnimatePresence initial={false}>
        {expanded && <motion.span variants={textVariants} initial="hidden" animate="visible" exit="hidden" style={{ overflow: 'hidden', whiteSpace: 'nowrap' }} className={to === '/' ? 'text-xl font-semibold' : ''}>{label}</motion.span>}
      </AnimatePresence>
    </Link>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const [hovered, setHovered] = useState(false);
  const expanded = hovered || !collapsed;
  const handleToggle = () => { setHovered(false); onToggle(); };

  return (
    <motion.nav initial={false} animate={{ width: expanded ? '16rem' : '4.5rem' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} id="sidebar" aria-label="Main navigation" className={`sidebar ${expanded ? 'expanded' : 'collapsed'}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div><SidebarLink expanded={expanded} to="/" exact label="YT-DL Studio" icon={<SidebarIcon name="home" />} /></div>
      <div className="space-y-2">
        <SidebarLink expanded={expanded} to="/settings" label="Settings" icon={<SidebarIcon name="settings" />} />
        <SidebarLink expanded={expanded} to="/donate" label="Donate" icon={<SidebarIcon name="donate" />} />
        <SidebarLink expanded={expanded} to="/about" label="About" icon={<SidebarIcon name="about" />} />
      </div>
      <button type="button" id="sidebar-collapse-btn" aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'} aria-expanded={expanded} className="btn p-0" onClick={handleToggle}>
        <motion.svg animate={{ rotate: expanded ? 0 : 180 }} transition={{ duration: 0.3 }} xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></motion.svg>
      </button>
    </motion.nav>
  );
}
