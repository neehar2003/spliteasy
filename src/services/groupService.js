import { supabase } from './database/supabaseClient';
import { generateId, nowIso, assertNoError, DatabaseError } from './database/db';
import { getCurrentUserName } from './settingsService';

export async function listGroups() {
  const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
  assertNoError(error);
  return data.map(mapGroupRow);
}

export async function getGroup(groupId) {
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  assertNoError(error);
  if (!data) return null;
  const group = mapGroupRow(data);
  group.members = await listMembers(groupId);
  return group;
}

export async function listMembers(groupId) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  assertNoError(error);
  return data.map(mapMemberRow);
}

export async function createGroup({ name, description, memberNames }) {
  const groupId = generateId();
  const now = nowIso();
  const createdBy = getCurrentUserName() || 'Unknown';

  const { error: groupError } = await supabase.from('groups').insert({
    id: groupId,
    name: name.trim(),
    description: description?.trim() || null,
    created_by: createdBy,
    created_at: now,
  });
  assertNoError(groupError);

  const memberRows = memberNames.map((memberName) => ({
    id: generateId(),
    group_id: groupId,
    name: memberName.trim(),
    created_at: now,
  }));
  if (memberRows.length) {
    const { error: memberError } = await supabase.from('members').insert(memberRows);
    assertNoError(memberError);
  }

  return getGroup(groupId);
}

export async function updateGroup(groupId, { name, description }) {
  const { error } = await supabase
    .from('groups')
    .update({ name: name.trim(), description: description?.trim() || null })
    .eq('id', groupId);
  assertNoError(error);
  return getGroup(groupId);
}

export async function deleteGroup(groupId) {
  // members/expenses/expense_participants/settlements all cascade from groups.id.
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  assertNoError(error);
}

export async function addMember(groupId, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new DatabaseError('Member name is required.');
  const existing = (await listMembers(groupId)).map((m) => m.name.toLowerCase());
  if (existing.includes(trimmed.toLowerCase())) {
    throw new DatabaseError('A member with that name already exists in this group.');
  }
  const id = generateId();
  const { error } = await supabase
    .from('members')
    .insert({ id, group_id: groupId, name: trimmed, created_at: nowIso() });
  assertNoError(error);
  return { id, groupId, name: trimmed };
}

export async function renameMember(memberId, name) {
  const { error } = await supabase.from('members').update({ name: name.trim() }).eq('id', memberId);
  assertNoError(error);
}

/**
 * A member can only be removed if they are not referenced by any expense
 * (as payer or participant) or settlement - removing them would otherwise
 * invalidate existing financial records.
 */
export async function memberHasRecords(memberId) {
  const [{ count: asPayer, error: e1 }, { count: asParticipant, error: e2 }, { count: asFrom, error: e3 }, { count: asTo, error: e4 }] =
    await Promise.all([
      supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('payer_id', memberId),
      supabase.from('expense_participants').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
      supabase.from('settlements').select('id', { count: 'exact', head: true }).eq('from_member_id', memberId),
      supabase.from('settlements').select('id', { count: 'exact', head: true }).eq('to_member_id', memberId),
    ]);
  assertNoError(e1);
  assertNoError(e2);
  assertNoError(e3);
  assertNoError(e4);
  return asPayer > 0 || asParticipant > 0 || asFrom > 0 || asTo > 0;
}

export async function removeMember(memberId) {
  if (await memberHasRecords(memberId)) {
    throw new DatabaseError('This member has existing expenses or settlements and cannot be removed.');
  }
  const { error } = await supabase.from('members').delete().eq('id', memberId);
  assertNoError(error);
}

function mapGroupRow(row) {
  return { id: row.id, name: row.name, description: row.description, createdBy: row.created_by, createdAt: row.created_at };
}

function mapMemberRow(row) {
  return { id: row.id, groupId: row.group_id, name: row.name, createdAt: row.created_at };
}
