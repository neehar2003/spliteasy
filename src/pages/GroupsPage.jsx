import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, ChevronRight } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { listGroups, listMembers } from '../services/groupService';
import { listExpenses } from '../services/expenseService';
import { useAsyncData } from '../hooks/useAsyncData';
import { totalExpenses } from '../algorithms/calculateBalances';
import { formatPaise } from '../utils/currency';
import EmptyState from '../components/common/EmptyState';
import GroupFormModal from '../components/groups/GroupFormModal';

async function loadGroupsWithTotals() {
  const groups = await listGroups();
  return Promise.all(
    groups.map(async (g) => {
      const [members, expenses] = await Promise.all([listMembers(g.id), listExpenses(g.id)]);
      return { ...g, memberCount: members.length, total: totalExpenses(expenses) };
    })
  );
}

export default function GroupsPage() {
  const { version, refresh } = useDatabase();
  const [showForm, setShowForm] = useState(false);

  const fetchGroups = useCallback(loadGroupsWithTotals, []);
  const { data: groups, loading } = useAsyncData(fetchGroups, [version], []);

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Groups</h1>
          <p className="page-subtitle">All your expense groups in one place.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> New group
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          message="Create a group and add members to start splitting expenses."
          action={
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} /> Create a group
            </button>
          }
        />
      ) : (
        <div className="card-grid">
          {groups.map((g) => (
            <Link to={`/groups/${g.id}`} key={g.id} className="card" style={{ color: 'inherit', display: 'block' }}>
              <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 16 }}>{g.name}</h3>
                <ChevronRight size={18} className="muted" />
              </div>
              {g.description && <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{g.description}</p>}
              <div className="flex-row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 13 }}>{g.memberCount} members</span>
                <span style={{ fontWeight: 700 }}>{formatPaise(g.total)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <GroupFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
