import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Wallet } from 'lucide-react';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <div className="sidebar-brand" style={{ padding: 0 }}>
          <span className="brand-mark"><Wallet size={16} /></span>
          SplitEasy
        </div>
        <button className="icon-btn" aria-label="Open navigation menu" onClick={() => setMobileOpen((v) => !v)}>
          <Menu size={18} />
        </button>
      </div>
      <Sidebar className={mobileOpen ? 'open' : ''} onNavigate={() => setMobileOpen(false)} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
