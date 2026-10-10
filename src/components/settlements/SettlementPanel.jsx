import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Undo2, Trash2 } from 'lucide-react';
import { useDatabase } from '../../context/DatabaseContext';
import { listMembers } from '../../services/groupService';
import {
  getBalances,
  getSuggestedSettlements,
  listSettlements,
  recordSettlement,
  markCompleted,
  undoSettlement,
  deleteSettlement,
} from '../../services/settlementService';
import { formatPaise } from '../../utils/currency';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../../hooks/useToast';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function SettlementPanel({ groupId }) {
  const { version, refresh } = useDatabase();
  const toast = useToast();
  const [confirmPay, setConfirmPay] = useState(null); // { fromId, toId, amountPaise }
  const [settleDate, setSettleDate] = useState(todayIso());
  const [undoTarget, setUndoTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const data = useMemo(() => {
    const members = listMembers(groupId);
    const nameById = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const balances = [...getBalances(groupId).values()];
    const suggestions = getSuggestedSettlements(groupId);
    const history = listSettlements(groupId);
    return {
      members,
      nameById,
      balances,
      suggestions,
      pending: history.filter((s) => !s.completed),
      completed: history.filter((s) => s.completed),
    };
  }, [groupId, version]);

  async function handleConfirmPay() {
    try {
      const settlement = await recordSettlement(groupId, confirmPay);
      await markCompleted(settlement.id, settleDate);
      toast.success('Settlement recorded.');
      setConfirmPay(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleUndo() {
    try {
      await undoSettlement(undoTarget.id);
      toast.success('Settlement reverted to pending.');
      setUndoTarget(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete() {
    try {
      await deleteSettlement(deleteTarget.id);
      toast.success('Settlement record removed.');
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="card">
        <h3 className="section-title">Balances</h3>
        {data.balances.every((b) => b.afterSettlements === 0) ? (
          <p className="muted">Everyone is settled up. 🎉</p>
        ) : (
          data.balances.map((b) => (
            <div className="list-row" key={b.memberId}>
              <span style={{ fontWeight: 600 }}>{data.nameById[b.memberId]}</span>
              {b.afterSettlements === 0 ? (
                <span className="badge badge-neutral">Settled</span>
              ) : b.afterSettlements > 0 ? (
                <span className="badge badge-success">is owed {formatPaise(b.afterSettlements)}</span>
              ) : (
                <span className="badge badge-danger">owes {formatPaise(-b.afterSettlements)}</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3 className="section-title">Suggested settlements</h3>
        <p className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
          The fewest payments needed to settle every outstanding balance.
        </p>
        {data.suggestions.length === 0 ? (
          <p className="muted">No pending payments — everyone is settled up.</p>
        ) : (
          data.suggestions.map((s, i) => (
            <div className="list-row" key={i}>
              <div className="flex-row">
                <span style={{ fontWeight: 600 }}>{data.nameById[s.fromId]}</span>
                <ArrowRight size={14} className="muted" />
                <span style={{ fontWeight: 600 }}>{data.nameById[s.toId]}</span>
                <span className="muted">{formatPaise(s.amountPaise)}</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setConfirmPay(s)}>
                <CheckCircle2 size={14} /> Mark as paid
              </button>
            </div>
          ))
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="section-title">Completed settlements</h3>
          {data.completed.length === 0 ? (
            <p className="muted">No completed settlements yet.</p>
          ) : (
            data.completed.map((s) => (
              <div className="list-row" key={s.id}>
                <div>
                  <div className="flex-row">
                    <strong>{data.nameById[s.fromId]}</strong>
                    <ArrowRight size={13} className="muted" />
                    <strong>{data.nameById[s.toId]}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{formatPaise(s.amountPaise)} on {s.settledDate}</div>
                </div>
                <button className="icon-btn" aria-label="Undo settlement" onClick={() => setUndoTarget(s)}>
                  <Undo2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 className="section-title">Pending settlements</h3>
          {data.pending.length === 0 ? (
            <p className="muted">No pending settlement records.</p>
          ) : (
            data.pending.map((s) => (
              <div className="list-row" key={s.id}>
                <div className="flex-row">
                  <strong>{data.nameById[s.fromId]}</strong>
                  <ArrowRight size={13} className="muted" />
                  <strong>{data.nameById[s.toId]}</strong>
                  <span className="muted">{formatPaise(s.amountPaise)}</span>
                </div>
                <button className="icon-btn" aria-label="Remove pending settlement" onClick={() => setDeleteTarget(s)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {confirmPay && (
        <ConfirmDialog
          title="Mark payment as completed?"
          message={
            <>
              Confirm that <strong>{data.nameById[confirmPay.fromId]}</strong> paid{' '}
              <strong>{data.nameById[confirmPay.toId]}</strong> {formatPaise(confirmPay.amountPaise)}.
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="settle-date">Settlement date</label>
                <input id="settle-date" type="date" value={settleDate} onChange={(e) => setSettleDate(e.target.value)} />
              </div>
            </>
          }
          confirmLabel="Mark as paid"
          onConfirm={handleConfirmPay}
          onCancel={() => setConfirmPay(null)}
        />
      )}

      {undoTarget && (
        <ConfirmDialog
          title="Undo this settlement?"
          message="This will move the payment back to pending and the outstanding balance will be restored."
          confirmLabel="Undo"
          danger
          onConfirm={handleUndo}
          onCancel={() => setUndoTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove pending settlement record?"
          message="This will permanently remove this unconfirmed settlement record."
          confirmLabel="Remove"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
