import { supabase } from './database/supabaseClient';
import { assertNoError, DatabaseError } from './database/db';

const BACKUP_VERSION = 1;

/** Export the entire shared database as a plain JSON-serializable object. */
export async function exportBackupData() {
  const [groups, members, expenses, expenseParticipants, settlements] = await Promise.all([
    supabase.from('groups').select('*'),
    supabase.from('members').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('expense_participants').select('*'),
    supabase.from('settlements').select('*'),
  ]);
  assertNoError(groups.error);
  assertNoError(members.error);
  assertNoError(expenses.error);
  assertNoError(expenseParticipants.error);
  assertNoError(settlements.error);

  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    groups: groups.data,
    members: members.data,
    expenses: expenses.data,
    expenseParticipants: expenseParticipants.data,
    settlements: settlements.data,
  };
}

function validateBackupShape(data) {
  if (!data || typeof data !== 'object') return 'File is not a valid backup (not an object).';
  if (data.backupVersion !== BACKUP_VERSION) return `Unsupported backup version: ${data.backupVersion}.`;
  const tables = ['groups', 'members', 'expenses', 'expenseParticipants', 'settlements'];
  for (const t of tables) {
    if (!Array.isArray(data[t])) return `Backup is missing or has an invalid "${t}" section.`;
  }
  const requiredFields = {
    groups: ['id', 'name', 'created_at'],
    members: ['id', 'group_id', 'name'],
    expenses: ['id', 'group_id', 'title', 'amount_paise', 'payer_id'],
    expenseParticipants: ['id', 'expense_id', 'member_id', 'share_paise'],
    settlements: ['id', 'group_id', 'from_member_id', 'to_member_id', 'amount_paise'],
  };
  for (const [table, fields] of Object.entries(requiredFields)) {
    for (const row of data[table]) {
      for (const f of fields) {
        if (!(f in row)) return `A row in "${table}" is missing required field "${f}".`;
      }
    }
  }
  return null;
}

/**
 * Validate and replace all shared data with the given backup. Rejects
 * malformed/corrupted backups. This affects every user of the shared
 * database, not just this browser.
 */
export async function importBackupData(data) {
  const error = validateBackupShape(data);
  if (error) throw new DatabaseError(`Invalid backup file: ${error}`);

  const del = async (table) => assertNoError((await supabase.from(table).delete().not('id', 'is', null)).error);
  await del('expense_participants');
  await del('settlements');
  await del('expenses');
  await del('members');
  await del('groups');

  const groupsPayload = data.groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    created_by: g.created_by ?? 'Unknown',
    created_at: g.created_at,
  }));
  if (groupsPayload.length) assertNoError((await supabase.from('groups').insert(groupsPayload)).error);

  const membersPayload = data.members.map((m) => ({
    id: m.id,
    group_id: m.group_id,
    name: m.name,
    created_at: m.created_at,
  }));
  if (membersPayload.length) assertNoError((await supabase.from('members').insert(membersPayload)).error);

  const expensesPayload = data.expenses.map((e) => ({
    id: e.id,
    group_id: e.group_id,
    title: e.title,
    amount_paise: e.amount_paise,
    payer_id: e.payer_id,
    expense_date: e.expense_date,
    notes: e.notes ?? null,
    split_method: e.split_method ?? 'equal',
    created_by: e.created_by ?? 'Unknown',
    created_at: e.created_at,
    updated_at: e.updated_at ?? e.created_at,
  }));
  if (expensesPayload.length) assertNoError((await supabase.from('expenses').insert(expensesPayload)).error);

  const participantsPayload = data.expenseParticipants.map((p) => ({
    id: p.id,
    expense_id: p.expense_id,
    member_id: p.member_id,
    share_paise: p.share_paise,
  }));
  if (participantsPayload.length) assertNoError((await supabase.from('expense_participants').insert(participantsPayload)).error);

  const settlementsPayload = data.settlements.map((s) => ({
    id: s.id,
    group_id: s.group_id,
    from_member_id: s.from_member_id,
    to_member_id: s.to_member_id,
    amount_paise: s.amount_paise,
    completed: !!s.completed,
    settled_date: s.settled_date ?? null,
    created_by: s.created_by ?? 'Unknown',
    created_at: s.created_at,
  }));
  if (settlementsPayload.length) assertNoError((await supabase.from('settlements').insert(settlementsPayload)).error);
}
