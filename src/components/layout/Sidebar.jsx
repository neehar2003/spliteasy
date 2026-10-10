import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Receipt, HandCoins, Settings, Wallet } from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/settlements', label: 'Settlements', icon: HandCoins },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ className = '', onNavigate }) {
  return (
    <nav className={`sidebar ${className}`} aria-label="Main navigation">
      <div className="sidebar-brand">
        <span className="brand-mark"><Wallet size={18} /></span>
        SplitEasy
      </div>
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
