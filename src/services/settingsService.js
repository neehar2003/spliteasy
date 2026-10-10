// App has no authentication (it is a static, backend-less site), so "who am
// I" is just a display name the user picks once in Settings. Dashboard totals
// match this name (case-insensitively) against member records across groups.
import { run, query, persist } from './database/db';

const CURRENT_USER_KEY = 'current_user_name';

export function getCurrentUserName() {
  const rows = query('SELECT value FROM schema_meta WHERE key = ?', [CURRENT_USER_KEY]);
  return rows[0]?.value || null;
}

export async function setCurrentUserName(name) {
  const trimmed = name.trim();
  run('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)', [CURRENT_USER_KEY, trimmed]);
  await persist();
  return trimmed;
}
