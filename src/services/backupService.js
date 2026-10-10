import { run, query, transaction, persist, DatabaseError } from './database/db';

const BACKUP_VERSION = 1;

/** Export the entire database as a plain JSON-serializable object. */
export function exportBackupData() {
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    groups: query('SELECT * FROM groups'),
    members: query('SELECT * FROM members'),
    expenses: query('SELECT * FROM expenses'),
    expenseParticipants: query('SELECT * FROM expense_participants'),
    settlements: query('SELECT * FROM settlements'),
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

/** Validate and replace all data with the given backup. Rejects malformed/corrupted backups. */
export async function importBackupData(data) {
  const error = validateBackupShape(data);
  if (error) throw new DatabaseError(`Invalid backup file: ${error}`);

  transaction(() => {
    run('DELETE FROM expense_participants');
    run('DELETE FROM settlements');
    run('DELETE FROM expenses');
    run('DELETE FROM members');
    run('DELETE FROM groups');

    for (const g of data.groups) {
      run('INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)', [
        g.id,
        g.name,
        g.description ?? null,
        g.created_at,
      ]);
    }
    for (const m of data.members) {
      run('INSERT INTO members (id, group_id, name, created_at) VALUES (?, ?, ?, ?)', [
        m.id,
        m.group_id,
        m.name,
        m.created_at,
      ]);
    }
    for (const e of data.expenses) {
      run(
        `INSERT INTO expenses (id, group_id, title, amount_paise, payer_id, expense_date, notes, split_method, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.group_id,
          e.title,
          e.amount_paise,
          e.payer_id,
          e.expense_date,
          e.notes ?? null,
          e.split_method ?? 'equal',
          e.created_at,
          e.updated_at ?? e.created_at,
        ]
      );
    }
    for (const p of data.expenseParticipants) {
      run('INSERT INTO expense_participants (id, expense_id, member_id, share_paise) VALUES (?, ?, ?, ?)', [
        p.id,
        p.expense_id,
        p.member_id,
        p.share_paise,
      ]);
    }
    for (const s of data.settlements) {
      run(
        `INSERT INTO settlements (id, group_id, from_member_id, to_member_id, amount_paise, completed, settled_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.group_id, s.from_member_id, s.to_member_id, s.amount_paise, s.completed ? 1 : 0, s.settled_date ?? null, s.created_at]
      );
    }
  });
  await persist();
}
