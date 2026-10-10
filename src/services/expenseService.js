import { run, query, transaction, persist, generateId, nowIso, DatabaseError } from './database/db';
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

  transaction(() => {
    run(
      `INSERT INTO expenses (id, group_id, title, amount_paise, payer_id, expense_date, notes, split_method, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, groupId, title.trim(), amountPaise, payerId, date, notes?.trim() || null, splitMethod, now, now]
    );
    for (const memberId of participantIds) {
      run('INSERT INTO expense_participants (id, expense_id, member_id, share_paise) VALUES (?, ?, ?, ?)', [
        generateId(),
        id,
        memberId,
        shares[memberId],
      ]);
    }
  });
  await persist();
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

  transaction(() => {
    run(
      `UPDATE expenses SET title = ?, amount_paise = ?, payer_id = ?, expense_date = ?, notes = ?, split_method = ?, updated_at = ?
       WHERE id = ?`,
      [title.trim(), amountPaise, payerId, date, notes?.trim() || null, splitMethod, now, expenseId]
    );
    run('DELETE FROM expense_participants WHERE expense_id = ?', [expenseId]);
    for (const memberId of participantIds) {
      run('INSERT INTO expense_participants (id, expense_id, member_id, share_paise) VALUES (?, ?, ?, ?)', [
        generateId(),
        expenseId,
        memberId,
        shares[memberId],
      ]);
    }
  });
  await persist();
  return getExpense(expenseId);
}

export async function deleteExpense(expenseId) {
  transaction(() => {
    run('DELETE FROM expense_participants WHERE expense_id = ?', [expenseId]);
    run('DELETE FROM expenses WHERE id = ?', [expenseId]);
  });
  await persist();
}

export function getExpense(expenseId) {
  const rows = query('SELECT * FROM expenses WHERE id = ?', [expenseId]);
  if (!rows.length) return null;
  return attachParticipants(mapExpenseRow(rows[0]));
}

export function listExpenses(groupId, filters = {}) {
  const { search, dateFrom, dateTo, memberId, sortBy = 'expense_date', sortDir = 'DESC' } = filters;
  const clauses = ['group_id = ?'];
  const params = [groupId];

  if (search) {
    clauses.push('title LIKE ?');
    params.push(`%${search}%`);
  }
  if (dateFrom) {
    clauses.push('expense_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('expense_date <= ?');
    params.push(dateTo);
  }
  if (memberId) {
    clauses.push(
      '(payer_id = ? OR id IN (SELECT expense_id FROM expense_participants WHERE member_id = ?))'
    );
    params.push(memberId, memberId);
  }

  const allowedSort = { expense_date: 'expense_date', amount_paise: 'amount_paise', title: 'title' };
  const sortColumn = allowedSort[sortBy] || 'expense_date';
  const direction = sortDir === 'ASC' ? 'ASC' : 'DESC';

  const rows = query(
    `SELECT * FROM expenses WHERE ${clauses.join(' AND ')} ORDER BY ${sortColumn} ${direction}, created_at DESC`,
    params
  );
  return rows.map(mapExpenseRow).map(attachParticipants);
}

function attachParticipants(expense) {
  expense.participants = query('SELECT * FROM expense_participants WHERE expense_id = ?', [expense.id]).map((row) => ({
    memberId: row.member_id,
    sharePaise: row.share_paise,
  }));
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
