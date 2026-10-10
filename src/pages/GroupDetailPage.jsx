import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, UserPlus, ArrowLeft, Receipt } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { getGroup, deleteGroup, addMember, removeMember, memberHasRecords } from '../services/groupService';
import { listExpenses } from '../services/expenseService';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import GroupFormModal from '../components/groups/GroupFormModal';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';
import ExpenseList from '../components/expenses/ExpenseList';
import SettlementPanel from '../components/settlements/SettlementPanel';
import { useToast } from '../hooks/useToast';

const TABS = ['Overview', 'Expenses', 'Settlements'];

export default function GroupDetailPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { version, refresh } = useDatabase();
  const toast = useToast();

  const [tab, setTab] = useState('Overview');
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [showDeleteGroup, setShowDeleteGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const group = useMemo(() => getGroup(groupId), [groupId, version]);
  const expenses = useMemo(() => (group ? listExpenses(groupId) : []), [groupId, version]);
  const nameById = useMemo(() => Object.fromEntries((group?.members || []).map((m) => [m.id, m.name])), [group]);

  if (!group) {
    return (
      <EmptyState
        icon={Receipt}
        title="Group not found"
        message="This group may have been deleted."
        action={<button className="btn btn-primary" onClick={() => navigate('/groups')}>Back to groups</button>}
      />
    );
  }

  async function handleAddMember(e) {
    e.preventDefault();
    try {
      await addMember(groupId, newMemberName);
      setNewMemberName('');
      setShowAddMember(false);
      toast.success('Member added.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleRemoveMember() {
    try {
      await removeMember(removeTarget.id);
      toast.success('Member removed.');
      setRemoveTarget(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
      setRemoveTarget(null);
    }
  }

  async function handleDeleteGroup() {
    try {
      await deleteGroup(groupId);
      toast.success('Group deleted.');
      navigate('/groups');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/groups')}>
        <ArrowLeft size={14} /> All groups
      </button>

      <div className="page-header">
        <div>
          <h1>{group.name}</h1>
          {group.description && <p className="page-subtitle">{group.description}</p>}
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowEditGroup(true)}>
            <Pencil size={14} /> Edit
          </button>
          <button className="btn btn-danger" onClick={() => setShowDeleteGroup(true)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="card">
          <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Members</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddMember(true)}>
              <UserPlus size={14} /> Add member
            </button>
          </div>
          {group.members.map((m) => (
            <div className="list-row" key={m.id}>
              <div className="flex-row">
                <span className="avatar">{m.name.slice(0, 2).toUpperCase()}</span>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
              </div>
              <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => setRemoveTarget(m)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'Expenses' && (
        <div className="card">
          <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Expenses</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowExpenseForm(true)}>
              <Plus size={14} /> Add expense
            </button>
          </div>
          <ExpenseList
            expenses={expenses}
            memberNameById={nameById}
            onEdit={(e) => setEditingExpense(e)}
            onChanged={refresh}
          />
        </div>
      )}

      {tab === 'Settlements' && <SettlementPanel groupId={groupId} />}

      {showEditGroup && (
        <GroupFormModal group={group} onClose={() => setShowEditGroup(false)} onSaved={() => { setShowEditGroup(false); refresh(); }} />
      )}

      {showDeleteGroup && (
        <ConfirmDialog
          title="Delete this group?"
          message="This permanently deletes the group, its members, expenses, and settlement history. This cannot be undone."
          confirmLabel="Delete group"
          danger
          onConfirm={handleDeleteGroup}
          onCancel={() => setShowDeleteGroup(false)}
        />
      )}

      {showAddMember && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowAddMember(false)}>
          <div className="modal" style={{ maxWidth: 380 }} role="dialog" aria-modal="true" aria-label="Add member">
            <div className="modal-header">
              <h2 style={{ fontSize: 18 }}>Add member</h2>
            </div>
            <form onSubmit={handleAddMember}>
              <div className="field">
                <label htmlFor="new-member">Name</label>
                <input id="new-member" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} autoFocus required />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.name}?`}
          message={
            memberHasRecords(removeTarget.id)
              ? `${removeTarget.name} has existing expenses or settlements and cannot be removed. Delete or reassign those first.`
              : `This will remove ${removeTarget.name} from the group.`
          }
          confirmLabel="Remove"
          danger
          onConfirm={handleRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {showExpenseForm && (
        <ExpenseFormModal groupId={groupId} onClose={() => setShowExpenseForm(false)} onSaved={() => { setShowExpenseForm(false); refresh(); }} />
      )}
      {editingExpense && (
        <ExpenseFormModal
          groupId={groupId}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => { setEditingExpense(null); refresh(); }}
        />
      )}
    </div>
  );
}
