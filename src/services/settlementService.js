import { supabase } from './database/supabaseClient';
import { generateId, nowIso, assertNoError, DatabaseError } from './database/db';
import { getCurrentUserName } from './settingsService';
import { listMembers } from './groupService';
import { listExpenses } from './expenseService';
import { calculateBalances } from '../algorithms/calculateBalances';
import { calculateSettlements } from '../algorithms/calculateSettlements';

async function loadGroupData(groupId) {
  const [members, expenses, settlements] = await Promise.all([
    listMembers(groupId),
    listExpenses(groupId),
    listSettlements(groupId),
  ]);
  return { members, expenses, settlements };
}

/** Each member's paid/fairShare/net/afterSettlements balance for a group. */
export async function getBalances(groupId) {
  const { members, expenses, settlements } = await loadGroupData(groupId);
  return calculateBalances(members, expenses, settlements);
}

/** Suggested payments that would zero out every member's current outstanding balance. */
export async function getSuggestedSettlements(groupId) {
  const { members, expenses, settlements } = await loadGroupData(groupId);
  return calculateSettlements(members, expenses, settlements);
}

export async function listSettlements(groupId) {
  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  assertNoError(error);
  return data.map(mapRow);
}

/** Record a brand-new settlement (defaults to pending). */
export async function recordSettlement(groupId, { fromId, toId, amountPaise }) {
  if (fromId === toId) throw new DatabaseError('A member cannot settle up with themselves.');
  if (!(amountPaise > 0)) throw new DatabaseError('Settlement amount must be greater than zero.');

  const id = generateId();
  const { error } = await supabase.from('settlements').insert({
    id,
    group_id: groupId,
    from_member_id: fromId,
    to_member_id: toId,
    amount_paise: amountPaise,
    completed: false,
    settled_date: null,
    created_by: getCurrentUserName() || 'Unknown',
    created_at: nowIso(),
  });
  assertNoError(error);

  const { data, error: fetchError } = await supabase.from('settlements').select('*').eq('id', id).maybeSingle();
  assertNoError(fetchError);
  return mapRow(data);
}

/** Mark a pending settlement as completed on the given date. */
export async function markCompleted(settlementId, settledDate = new Date().toISOString().slice(0, 10)) {
  const { error } = await supabase
    .from('settlements')
    .update({ completed: true, settled_date: settledDate })
    .eq('id', settlementId);
  assertNoError(error);
}

/** Undo a mistakenly recorded completion, moving it back to pending. */
export async function undoSettlement(settlementId) {
  const { error } = await supabase
    .from('settlements')
    .update({ completed: false, settled_date: null })
    .eq('id', settlementId);
  assertNoError(error);
}

export async function deleteSettlement(settlementId) {
  const { error } = await supabase.from('settlements').delete().eq('id', settlementId);
  assertNoError(error);
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
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
