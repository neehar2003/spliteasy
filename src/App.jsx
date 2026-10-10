import { HashRouter, Routes, Route } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { ToastProvider } from './hooks/useToast';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import ExpensesPage from './pages/ExpensesPage';
import SettlementsPage from './pages/SettlementsPage';
import SettingsPage from './pages/SettingsPage';

function AppRoutes() {
  const { status, error } = useDatabase();

  if (status === 'loading') {
    return <div className="loading-screen">Connecting…</div>;
  }

  if (status === 'error') {
    return (
      <div className="error-screen">
        <AlertTriangle size={32} color="#d1393f" style={{ marginBottom: 12 }} />
        <h2>Couldn't load SplitEasy</h2>
        <p className="muted">{error?.message || 'Something went wrong while connecting to the database.'}</p>
        <p className="muted">Try reloading the page. If the problem persists, check your internet connection or that the Supabase project is reachable.</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:groupId" element={<GroupDetailPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <DatabaseProvider>
          <AppRoutes />
        </DatabaseProvider>
      </ToastProvider>
    </HashRouter>
  );
}
