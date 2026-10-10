import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { listMembers } from '../../services/groupService';
import { createExpense, updateExpense } from '../../services/expenseService';
import { rupeesToPaise, paiseToRupees } from '../../utils/currency';
import { validateExpenseForm } from '../../utils/validation';
import { useToast } from '../../hooks/useToast';

const SPLIT_METHODS = [
  { value: 'equal', label: 'Equal split' },
  { value: 'exact', label: 'Exact amounts' },
  { value: 'percentage', label: 'Percentage' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseFormModal({ groupId, expense, onClose, onSaved }) {
  const isEdit = !!expense;
  const members = useMemo(() => listMembers(groupId), [groupId]);

  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? String(paiseToRupees(expense.amountPaise)) : '');
  const [payerId, setPayerId] = useState(expense?.payerId || members[0]?.id || '');
  const [date, setDate] = useState(expense?.date || todayIso());
  const [notes, setNotes] = useState(expense?.notes || '');
  const [splitMethod, setSplitMethod] = useState(expense?.splitMethod || 'equal');
  const [participantIds, setParticipantIds] = useState(
    expense ? expense.participants.map((p) => p.memberId) : members.map((m) => m.id)
  );
  const initialExact = {};
  const initialPercent = {};
  if (expense) {
    for (const p of expense.participants) {
      initialExact[p.memberId] = paiseToRupees(p.sharePaise);
      initialPercent[p.memberId] = expense.amountPaise > 0 ? Number(((p.sharePaise / expense.amountPaise) * 100).toFixed(2)) : 0;
    }
  }
  const [exactInputs, setExactInputs] = useState(expense?.splitMethod === 'exact' ? initialExact : {});
  const [percentInputs, setPercentInputs] = useState(expense?.splitMethod === 'percentage' ? initialPercent : {});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function toggleParticipant(id) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  const amountPaise = rupeesToPaise(amount);

  const splitsInPaise = useMemo(() => {
    if (splitMethod === 'exact') {
      return Object.fromEntries(participantIds.map((id) => [id, rupeesToPaise(exactInputs[id] || 0)]));
    }
    if (splitMethod === 'percentage') {
      return Object.fromEntries(participantIds.map((id) => [id, Number(percentInputs[id] || 0)]));
    }
    return {};
  }, [splitMethod, participantIds, exactInputs, percentInputs]);

  const exactSum = participantIds.reduce((s, id) => s + rupeesToPaise(exactInputs[id] || 0), 0);
  const percentSum = participantIds.reduce((s, id) => s + Number(percentInputs[id] || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    const { isValid, errors: validationErrors } = validateExpenseForm({
      title,
      amountPaise,
      payerId,
      participantIds,
      date,
      splitMethod,
      splits: splitsInPaise,
    });
    setErrors(validationErrors);
    if (!isValid) return;

    const payload = { title, amountPaise, payerId, participantIds, date, notes, splitMethod, splits: splitsInPaise };

    setSaving(true);
    try {
      if (isEdit) {
        await updateExpense(expense.id, payload);
        toast.success('Expense updated.');
      } else {
        await createExpense(groupId, payload);
        toast.success('Expense added.');
      }
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit expense' : 'Add expense'} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="exp-title">Title</label>
          <input id="exp-title" className={errors.title ? 'invalid' : ''} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          {errors.title && <span className="error">{errors.title}</span>}
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="exp-amount">Amount (₹)</label>
            <input
              id="exp-amount"
              type="number"
              min="0"
              step="0.01"
              className={errors.amount ? 'invalid' : ''}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount && <span className="error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="exp-date">Date</label>
            <input id="exp-date" type="date" className={errors.date ? 'invalid' : ''} value={date} onChange={(e) => setDate(e.target.value)} />
            {errors.date && <span className="error">{errors.date}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="exp-payer">Paid by</label>
          <select id="exp-payer" className={errors.payer ? 'invalid' : ''} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {errors.payer && <span className="error">{errors.payer}</span>}
        </div>

        <div className="field">
          <label htmlFor="exp-notes">Notes (optional)</label>
          <textarea id="exp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="exp-split">Split method</label>
          <select id="exp-split" value={splitMethod} onChange={(e) => setSplitMethod(e.target.value)}>
            {SPLIT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Participants</label>
          {members.map((m) => (
            <div className="participant-row" key={m.id}>
              <label className="checkbox-row" style={{ flex: 1 }}>
                <input type="checkbox" checked={participantIds.includes(m.id)} onChange={() => toggleParticipant(m.id)} />
                <span className="participant-name">{m.name}</span>
              </label>
              {participantIds.includes(m.id) && splitMethod === 'exact' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="₹"
                  value={exactInputs[m.id] ?? ''}
                  onChange={(e) => setExactInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                />
              )}
              {participantIds.includes(m.id) && splitMethod === 'percentage' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="%"
                  value={percentInputs[m.id] ?? ''}
                  onChange={(e) => setPercentInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {errors.participants && <span className="error">{errors.participants}</span>}
          {splitMethod === 'exact' && (
            <p className="hint">Total entered: ₹{(exactSum / 100).toFixed(2)} of ₹{(amountPaise / 100 || 0).toFixed(2)}</p>
          )}
          {splitMethod === 'percentage' && <p className="hint">Total entered: {percentSum.toFixed(2)}% of 100%</p>}
          {errors.splits && <span className="error">{errors.splits}</span>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
