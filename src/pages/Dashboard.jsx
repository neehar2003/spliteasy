import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, Users, Wallet, ArrowDownCircle, ArrowUpCircle, Sparkles } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { getDashboardSummary } from '../services/dashboardService';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatPaise } from '../utils/currency';
import EmptyState from '../components/common/EmptyState';
import GroupFormModal from '../components/groups/GroupFormModal';
import { loadDemoData } from '../services/demoDataService';
import { useToast } from '../hooks/useToast';

export default function Dashboard() {
  const { version, refresh } = useDatabase();
  const { data: summary, loading } = useAsyncData(getDashboardSummary, [version]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const toast = useToast();

  if (loading || !summary) {
    return <p className="muted">Loading…</p>;
  }

  const noDataAtAll = summary.groupCount === 0;

  async function handleLoadDemo() {
    setLoadingDemo(true);
    try {
      await loadDemoData();
      refresh();
      toast.success('Demo data loaded.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingDemo(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            {summary.hasCurrentUser ? `Welcome back, ${summary.currentUserName}.` : 'Set your name in Settings to see personal totals.'}
          </p>
        </div>
        <div className="header-actions">
          {noDataAtAll && (
            <button className="btn btn-secondary" onClick={handleLoadDemo} disabled={loadingDemo}>
              <Sparkles size={16} /> {loadingDemo ? 'Loading…' : 'Load demo data'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowGroupForm(true)}>
            <Plus size={16} /> New group
          </button>
        </div>
      </div>

      {noDataAtAll ? (
        <EmptyState
          icon={Wallet}
          title="No groups yet"
          message="Create your first group to start tracking shared expenses, or load realistic demo data to explore the app."
          action={
            <div className="flex-row" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowGroupForm(true)}>
                <Plus size={16} /> Create a group
              </button>
              <button className="btn btn-secondary" onClick={handleLoadDemo} disabled={loadingDemo}>
                <Sparkles size={16} /> Load demo data
              </button>
            </div>
          }
        />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label"><Receipt size={14} /> Total expenses</div>
              <div className="stat-value">{formatPaise(summary.totalExpenseAmount)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Wallet size={14} /> You paid</div>
              <div className="stat-value">{formatPaise(summary.myPaid)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><ArrowUpCircle size={14} /> Owed to you</div>
              <div className="stat-value positive">{formatPaise(summary.owedToMe)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><ArrowDownCircle size={14} /> You owe</div>
              <div className="stat-value negative">{formatPaise(summary.myOwed)}</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3 className="section-title">Recent expenses</h3>
              {summary.recentExpenses.length === 0 ? (
                <p className="muted">No expenses recorded yet.</p>
              ) : (
                summary.recentExpenses.map((e) => (
                  <div className="list-row" key={e.id}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{e.title}</div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        <Link to={`/groups/${e.groupId}`}>{e.groupName}</Link> · {e.date}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700 }}>{formatPaise(e.amountPaise)}</div>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <h3 className="section-title"><Users size={16} style={{ verticalAlign: -3 }} /> Your groups</h3>
              {summary.groups.map((g) => (
                <div className="list-row" key={g.id}>
                  <Link to={`/groups/${g.id}`} style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    {g.name}
                  </Link>
                </div>
              ))}
              <Link to="/groups" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                View all groups
              </Link>
            </div>
          </div>
        </>
      )}

      {showGroupForm && (
        <GroupFormModal
          onClose={() => setShowGroupForm(false)}
          onSaved={() => {
            setShowGroupForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
