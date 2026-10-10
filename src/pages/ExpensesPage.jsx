import { useCallback, useState } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { listGroups, listMembers } from '../services/groupService';
import { listExpenses } from '../services/expenseService';
import { useAsyncData } from '../hooks/useAsyncData';
import EmptyState from '../components/common/EmptyState';
import ExpenseList from '../components/expenses/ExpenseList';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';

async function loadExpensesView(groups, groupId, filters) {
  const { search, dateFrom, dateTo, memberId, sortBy, sortDir } = filters;
  const groupNameById = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const targetGroups = groupId ? [groupId] : groups.map((g) => g.id);
  let all = [];
  const nameMaps = {};
  for (const gid of targetGroups) {
    const groupMembers = await listMembers(gid);
    for (const m of groupMembers) nameMaps[m.id] = m.name;
    const filtered = await listExpenses(gid, { search, dateFrom, dateTo, memberId: groupId ? memberId : '', sortBy, sortDir });
    all = all.concat(filtered);
  }
  all.sort((a, b) => {
    const dir = sortDir === 'ASC' ? 1 : -1;
    if (sortBy === 'amount_paise') return (a.amountPaise - b.amountPaise) * dir;
    if (sortBy === 'title') return a.title.localeCompare(b.title) * dir;
    return (new Date(a.date) - new Date(b.date)) * dir;
  });
  return { expenses: all, nameById: nameMaps, groupNameById };
}

export default function ExpensesPage() {
  const { version, refresh } = useDatabase();
  const { data: groups, loading: groupsLoading } = useAsyncData(useCallback(() => listGroups(), [version]), [version], []);

  const [groupId, setGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [memberId, setMemberId] = useState('');
  const [sortBy, setSortBy] = useState('expense_date');
  const [sortDir, setSortDir] = useState('DESC');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const { data: members } = useAsyncData(
    useCallback(() => (groupId ? listMembers(groupId) : Promise.resolve([])), [groupId]),
    [groupId, version],
    []
  );

  const fetchExpensesView = useCallback(
    () => loadExpensesView(groups, groupId, { search, dateFrom, dateTo, memberId, sortBy, sortDir }),
    [groups, groupId, search, dateFrom, dateTo, memberId, sortBy, sortDir]
  );
  const { data: view, loading: expensesLoading } = useAsyncData(
    fetchExpensesView,
    [groups, groupId, search, dateFrom, dateTo, memberId, sortBy, sortDir, version],
    { expenses: [], nameById: {}, groupNameById: {} }
  );
  const { expenses, nameById, groupNameById } = view;

  const noExpensesAtAll =
    !groupsLoading && !expensesLoading && groups.length > 0 && expenses.length === 0 && !search && !dateFrom && !dateTo && !memberId;

  if (groupsLoading) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Expenses</h1>
          <p className="page-subtitle">Search and filter expenses across all your groups.</p>
        </div>
        {groups.length > 0 && (
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => setShowForm(true)} disabled={!groupId}>
              <Plus size={16} /> Add expense
            </button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={Receipt} title="No groups yet" message="Create a group first, then add expenses to it." />
      ) : (
        <>
          <div className="filters-bar card">
            <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setMemberId(''); }}>
              <option value="">All groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
            {groupId && (
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">All members</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <select value={`${sortBy}:${sortDir}`} onChange={(e) => { const [b, d] = e.target.value.split(':'); setSortBy(b); setSortDir(d); }}>
              <option value="expense_date:DESC">Newest first</option>
              <option value="expense_date:ASC">Oldest first</option>
              <option value="amount_paise:DESC">Amount: high to low</option>
              <option value="amount_paise:ASC">Amount: low to high</option>
              <option value="title:ASC">Title: A–Z</option>
            </select>
          </div>

          {noExpensesAtAll ? (
            <EmptyState icon={Receipt} title="No expenses yet" message="Add your first expense to a group to see it here." />
          ) : (
            <div className="card">
              <ExpenseList
                expenses={expenses}
                memberNameById={nameById}
                groupNameById={!groupId ? groupNameById : undefined}
                onEdit={groupId ? (e) => setEditingExpense(e) : undefined}
                onChanged={refresh}
              />
            </div>
          )}
        </>
      )}

      {showForm && groupId && (
        <ExpenseFormModal groupId={groupId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refresh(); }} />
      )}
      {editingExpense && (
        <ExpenseFormModal
          groupId={editingExpense.groupId}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => { setEditingExpense(null); refresh(); }}
        />
      )}
    </div>
  );
}
