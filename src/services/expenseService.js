import { supabase } from './database/supabaseClient';
import { generateId, nowIso, assertNoError, DatabaseError } from './database/db';
import { getCurrentUserName } from './settingsService';
import { splitEqually, splitByPercentage } from '../utils/currency';
import { validateExpenseForm } from '../utils/validation';

/** Compute each participant's share in paise for the given split method. Order of `participantIds` is preserved for equal/percentage remainder distribution. */
export function computeShares(splitMethod, amountPaise, participantIds, splits) {
  if (splitMethod === 'equal') {
    const shares = splitEqually(amountPaise, participantIds.length);
    return Object.fromEntries(participantIds.map((id, i) => [id, shares[i]]));
  }
  if (splitMethod === 'exact') {
    return Object.fromEntries(participantIds.map((id) => [id, Math.round(splits[id])]));
  }
  if (splitMethod === 'percentage') {
    const percentages = participantIds.map((id) => Number(splits[id]));
    const shares = splitByPercentage(amountPaise, percentages);
    return Object.fromEntries(participantIds.map((id, i) => [id, shares[i]]));
  }
  throw new DatabaseError(`Unknown split method: ${splitMethod}`);
}

export async function createExpense(groupId, input) {
  const { title, amountPaise, payerId, participantIds, date, notes, splitMethod, splits } = input;
  const { isValid, errors } = validateExpenseForm({ title, amountPaise, payerId, participantIds, date, splitMethod, splits });
  if (!isValid) {
    throw new DatabaseError(Object.values(errors)[0]);
  }

  const shares = computeShares(splitMethod, amountPaise, participantIds, splits || {});
  const id = generateId();
  const now = nowIso();

  const { error: expenseError } = await supabase.from('expenses').insert({
    id,
    group_id: groupId,
    title: title.trim(),
    amount_paise: amountPaise,
    payer_id: payerId,
    expense_date: date,
    notes: notes?.trim() || null,
    split_method: splitMethod,
    created_by: getCurrentUserName() || 'Unknown',
    created_at: now,
    updated_at: now,
  });
  assertNoError(expenseError);

  const participantRows = participantIds.map((memberId) => ({
    id: generateId(),
    expense_id: id,
    member_id: memberId,
    share_paise: shares[memberId],
  }));
  const { error: participantError } = await supabase.from('expense_participants').insert(participantRows);
  assertNoError(participantError);

  return getExpense(id);
}

export async function updateExpense(expenseId, input) {
  const { title, amountPaise, payerId, participantIds, date, notes, splitMethod, splits } = input;
  const { isValid, errors } = validateExpenseForm({ title, amountPaise, payerId, participantIds, date, splitMethod, splits });
  if (!isValid) {
    throw new DatabaseError(Object.values(errors)[0]);
  }

  const shares = computeShares(splitMethod, amountPaise, participantIds, splits || {});
  const now = nowIso();

  const { error: expenseError } = await supabase
    .from('expenses')
    .update({
      title: title.trim(),
      amount_paise: amountPaise,
      payer_id: payerId,
      expense_date: date,
      notes: notes?.trim() || null,
      split_method: splitMethod,
      updated_at: now,
    })
    .eq('id', expenseId);
  assertNoError(expenseError);

  const { error: deleteError } = await supabase.from('expense_participants').delete().eq('expense_id', expenseId);
  assertNoError(deleteError);

  const participantRows = participantIds.map((memberId) => ({
    id: generateId(),
    expense_id: expenseId,
    member_id: memberId,
    share_paise: shares[memberId],
  }));
  const { error: participantError } = await supabase.from('expense_participants').insert(participantRows);
  assertNoError(participantError);

  return getExpense(expenseId);
}

export async function deleteExpense(expenseId) {
  // expense_participants cascades from expenses.id, but delete explicitly either way.
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  assertNoError(error);
}

export async function getExpense(expenseId) {
  const { data, error } = await supabase.from('expenses').select('*').eq('id', expenseId).maybeSingle();
  assertNoError(error);
  if (!data) return null;
  return attachParticipants(mapExpenseRow(data));
}

export async function listExpenses(groupId, filters = {}) {
  const { search, dateFrom, dateTo, memberId, sortBy = 'expense_date', sortDir = 'DESC' } = filters;

  let queryBuilder = supabase.from('expenses').select('*').eq('group_id', groupId);
  if (search) queryBuilder = queryBuilder.ilike('title', `%${search}%`);
  if (dateFrom) queryBuilder = queryBuilder.gte('expense_date', dateFrom);
  if (dateTo) queryBuilder = queryBuilder.lte('expense_date', dateTo);

  const allowedSort = { expense_date: 'expense_date', amount_paise: 'amount_paise', title: 'title' };
  const sortColumn = allowedSort[sortBy] || 'expense_date';
  queryBuilder = queryBuilder
    .order(sortColumn, { ascending: sortDir === 'ASC' })
    .order('created_at', { ascending: false });

  const { data, error } = await queryBuilder;
  assertNoError(error);
  let rows = data.map(mapExpenseRow);

  if (memberId) {
    const { data: participantRows, error: pError } = await supabase
      .from('expense_participants')
      .select('expense_id')
      .eq('member_id', memberId);
    assertNoError(pError);
    const participantExpenseIds = new Set(participantRows.map((r) => r.expense_id));
    rows = rows.filter((e) => e.payerId === memberId || participantExpenseIds.has(e.id));
  }

  return Promise.all(rows.map(attachParticipants));
}

async function attachParticipants(expense) {
  const { data, error } = await supabase.from('expense_participants').select('*').eq('expense_id', expense.id);
  assertNoError(error);
  expense.participants = data.map((row) => ({ memberId: row.member_id, sharePaise: row.share_paise }));
  return expense;
}

function mapExpenseRow(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    amountPaise: row.amount_paise,
    payerId: row.payer_id,
    date: row.expense_date,
    notes: row.notes,
    splitMethod: row.split_method,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
