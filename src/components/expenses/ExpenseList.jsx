import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { formatPaise } from '../../utils/currency';
import ConfirmDialog from '../common/ConfirmDialog';
import { deleteExpense } from '../../services/expenseService';
import { useToast } from '../../hooks/useToast';

const SPLIT_LABELS = { equal: 'Equal', exact: 'Exact', percentage: 'Percentage' };

/**
 * @param expenses  array of expenses (already joined with participants)
 * @param memberNameById  map of memberId -> name, for payer/participant display
 * @param groupNameById  optional map of groupId -> name (shown when listing across groups)
 * @param onEdit  called with the expense to edit (omit to hide edit action)
 * @param onChanged  called after a successful delete
 */
export default function ExpenseList({ expenses, memberNameById, groupNameById, onEdit, onChanged }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const toast = useToast();

  async function confirmDelete() {
    try {
      await deleteExpense(pendingDelete.id);
      toast.success('Expense deleted.');
      setPendingDelete(null);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (expenses.length === 0) {
    return <p className="muted">No expenses match your filters.</p>;
  }

  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            {groupNameById && <th>Group</th>}
            <th>Date</th>
            <th>Paid by</th>
            <th>Split</th>
            <th className="text-right">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{e.title}</div>
                {e.notes && <div className="muted" style={{ fontSize: 12 }}>{e.notes}</div>}
              </td>
              {groupNameById && <td>{groupNameById[e.groupId]}</td>}
              <td>{e.date}</td>
              <td>{memberNameById[e.payerId] || '-'}</td>
              <td><span className="badge badge-neutral">{SPLIT_LABELS[e.splitMethod]}</span></td>
              <td className="text-right" style={{ fontWeight: 700 }}>{formatPaise(e.amountPaise)}</td>
              <td>
                <div className="flex-row">
                  {onEdit && (
                    <button className="icon-btn" aria-label={`Edit ${e.title}`} onClick={() => onEdit(e)}>
                      <Pencil size={15} />
                    </button>
                  )}
                  <button className="icon-btn" aria-label={`Delete ${e.title}`} onClick={() => setPendingDelete(e)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete expense?"
          message={`This will permanently delete "${pendingDelete.title}" and recalculate balances for the group. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
