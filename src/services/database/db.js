// Shared data layer backed by Supabase (Postgres). There is no local
// database anymore — every read and write goes over the network to the
// same project, so data is shared across every browser/device that uses
// this app. There is no auth: rows are attributed by a free-text name
// (see settingsService) rather than a logged-in account.

import { supabase } from './supabaseClient';

export class DatabaseError extends Error {}

export function generateId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

/** Throws a DatabaseError with the Supabase error message if one occurred. */
export function assertNoError(error) {
  if (error) throw new DatabaseError(error.message);
}

/** Lightweight connectivity check used on app startup. */
export async function initDatabase() {
  const { error } = await supabase.from('groups').select('id').limit(1);
  assertNoError(error);
  return { restored: true };
}

/** Wipe all shared data. Used by Settings > Danger zone > Reset all data. */
export async function resetDatabase() {
  // Deleting groups cascades to members/expenses/expense_participants/settlements.
  const { error } = await supabase.from('groups').delete().not('id', 'is', null);
  assertNoError(error);
}
