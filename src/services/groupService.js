import { run, query, transaction, persist, generateId, nowIso, DatabaseError } from './database/db';

export function listGroups() {
  const groups = query('SELECT * FROM groups ORDER BY created_at DESC');
  return groups.map(mapGroupRow);
}

export function getGroup(groupId) {
  const rows = query('SELECT * FROM groups WHERE id = ?', [groupId]);
  if (!rows.length) return null;
  const group = mapGroupRow(rows[0]);
  group.members = listMembers(groupId);
  return group;
}

export function listMembers(groupId) {
  return query('SELECT * FROM members WHERE group_id = ? ORDER BY created_at ASC', [groupId]).map(mapMemberRow);
}

export async function createGroup({ name, description, memberNames }) {
  const groupId = generateId();
  const now = nowIso();
  transaction(() => {
    run('INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)', [
      groupId,
      name.trim(),
      description?.trim() || null,
      now,
    ]);
    for (const memberName of memberNames) {
      run('INSERT INTO members (id, group_id, name, created_at) VALUES (?, ?, ?, ?)', [
        generateId(),
        groupId,
        memberName.trim(),
        now,
      ]);
    }
  });
  await persist();
  return getGroup(groupId);
}

export async function updateGroup(groupId, { name, description }) {
  run('UPDATE groups SET name = ?, description = ? WHERE id = ?', [name.trim(), description?.trim() || null, groupId]);
  await persist();
  return getGroup(groupId);
}

export async function deleteGroup(groupId) {
  transaction(() => {
    run('DELETE FROM expense_participants WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)', [groupId]);
    run('DELETE FROM expenses WHERE group_id = ?', [groupId]);
    run('DELETE FROM settlements WHERE group_id = ?', [groupId]);
    run('DELETE FROM members WHERE group_id = ?', [groupId]);
    run('DELETE FROM groups WHERE id = ?', [groupId]);
  });
  await persist();
}

export async function addMember(groupId, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new DatabaseError('Member name is required.');
  const existing = listMembers(groupId).map((m) => m.name.toLowerCase());
  if (existing.includes(trimmed.toLowerCase())) {
    throw new DatabaseError('A member with that name already exists in this group.');
  }
  const id = generateId();
  run('INSERT INTO members (id, group_id, name, created_at) VALUES (?, ?, ?, ?)', [id, groupId, trimmed, nowIso()]);
  await persist();
  return { id, groupId, name: trimmed };
}

export async function renameMember(memberId, name) {
  run('UPDATE members SET name = ? WHERE id = ?', [name.trim(), memberId]);
  await persist();
}

/**
 * A member can only be removed if they are not referenced by any expense
 * (as payer or participant) or settlement — removing them would otherwise
 * invalidate existing financial records.
 */
export function memberHasRecords(memberId) {
  const asPayer = query('SELECT COUNT(*) as c FROM expenses WHERE payer_id = ?', [memberId])[0].c;
  const asParticipant = query('SELECT COUNT(*) as c FROM expense_participants WHERE member_id = ?', [memberId])[0].c;
  const asSettler = query('SELECT COUNT(*) as c FROM settlements WHERE from_member_id = ? OR to_member_id = ?', [
    memberId,
    memberId,
  ])[0].c;
  return asPayer > 0 || asParticipant > 0 || asSettler > 0;
}

export async function removeMember(memberId) {
  if (memberHasRecords(memberId)) {
    throw new DatabaseError('This member has existing expenses or settlements and cannot be removed.');
  }
  run('DELETE FROM members WHERE id = ?', [memberId]);
  await persist();
}

function mapGroupRow(row) {
  return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at };
}

function mapMemberRow(row) {
  return { id: row.id, groupId: row.group_id, name: row.name, createdAt: row.created_at };
}
