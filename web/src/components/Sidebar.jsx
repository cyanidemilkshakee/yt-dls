import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { FiHeart, FiHome, FiInfo, FiSettings } from 'react-icons/fi';

const icons = {
  home: FiHome,
  settings: FiSettings,
  donate: FiHeart,
  about: FiInfo,
};

function SidebarIcon({ name }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" className="sidebar-icon" />;
}

function SidebarLink({ to, icon, label, exact = false, expanded }) {
  const location = useLocation();
  const isActive = exact ? location.pathname === to : (location.pathname.startsWith(to) && to !== '/') || (to === '/' && location.pathname === '/');
  return (
    <Link aria-label={label} title={!expanded ? label : undefined} aria-current={isActive ? 'page' : undefined} to={to} className={`sidebar-link ${isActive ? 'active' : ''} ${to === '/' ? 'mb-4' : ''}`}>
      {icon}
      {expanded && <span style={{ overflow: 'hidden', whiteSpace: 'nowrap' }} className={to === '/' ? 'text-xl font-semibold' : ''}>{label}</span>}
    </Link>
  );
}

export default function Sidebar() {
  const [hovered, setHovered] = useState(false);
  const isHome = useLocation().pathname === '/';
  const expanded = hovered;

  return (
    <nav
      id="sidebar"
      aria-label="Main navigation"
      className={`sidebar ${expanded ? 'expanded' : 'collapsed'}${isHome ? ' sidebar-home' : ''}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div><SidebarLink expanded={expanded} to="/" exact label="YT-DL Studio" icon={<SidebarIcon name="home" />} /></div>
      <div className="space-y-2">
        <SidebarLink expanded={expanded} to="/settings" label="Settings" icon={<SidebarIcon name="settings" />} />
        <SidebarLink expanded={expanded} to="/donate" label="Donate" icon={<SidebarIcon name="donate" />} />
        <SidebarLink expanded={expanded} to="/about" label="About" icon={<SidebarIcon name="about" />} />
      </div>
    </nav>
  );
}
