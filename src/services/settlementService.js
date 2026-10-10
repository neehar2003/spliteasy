import { run, query, persist, generateId, nowIso, DatabaseError } from './database/db';
import { listMembers } from './groupService';
import { listExpenses } from './expenseService';
import { calculateBalances } from '../algorithms/calculateBalances';
import { calculateSettlements } from '../algorithms/calculateSettlements';

function loadGroupData(groupId) {
  const members = listMembers(groupId);
  const expenses = listExpenses(groupId);
  const settlements = listSettlements(groupId);
  return { members, expenses, settlements };
}

/** Each member's paid/fairShare/net/afterSettlements balance for a group. */
export function getBalances(groupId) {
  const { members, expenses, settlements } = loadGroupData(groupId);
  return calculateBalances(members, expenses, settlements);
}

/** Suggested payments that would zero out every member's current outstanding balance. */
export function getSuggestedSettlements(groupId) {
  const { members, expenses, settlements } = loadGroupData(groupId);
  return calculateSettlements(members, expenses, settlements);
}

export function listSettlements(groupId) {
  return query('SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC', [groupId]).map(mapRow);
}

/** Record a brand-new settlement (defaults to pending). */
export async function recordSettlement(groupId, { fromId, toId, amountPaise }) {
  if (fromId === toId) throw new DatabaseError('A member cannot settle up with themselves.');
  if (!(amountPaise > 0)) throw new DatabaseError('Settlement amount must be greater than zero.');

  const id = generateId();
  run(
    `INSERT INTO settlements (id, group_id, from_member_id, to_member_id, amount_paise, completed, settled_date, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
    [id, groupId, fromId, toId, amountPaise, nowIso()]
  );
  await persist();
  return mapRow(query('SELECT * FROM settlements WHERE id = ?', [id])[0]);
}

/** Mark a pending settlement as completed on the given date. */
export async function markCompleted(settlementId, settledDate = new Date().toISOString().slice(0, 10)) {
  run('UPDATE settlements SET completed = 1, settled_date = ? WHERE id = ?', [settledDate, settlementId]);
  await persist();
}

/** Undo a mistakenly recorded completion, moving it back to pending. */
export async function undoSettlement(settlementId) {
  run('UPDATE settlements SET completed = 0, settled_date = NULL WHERE id = ?', [settlementId]);
  await persist();
}

export async function deleteSettlement(settlementId) {
  run('DELETE FROM settlements WHERE id = ?', [settlementId]);
  await persist();
}

function mapRow(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    fromId: row.from_member_id,
    toId: row.to_member_id,
    amountPaise: row.amount_paise,
    completed: !!row.completed,
    settledDate: row.settled_date,
    createdAt: row.created_at,
  };
}
