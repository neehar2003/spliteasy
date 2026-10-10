// "Who am I" is a per-browser display name, not an account - it only decides
// which member row in a shared group is matched as "me" for dashboard totals
// (see dashboardService). Since it's local to this browser, it's kept in
// localStorage rather than the shared Supabase database.
const CURRENT_USER_KEY = 'spliteasy_current_user_name';

export function getCurrentUserName() {
  try {
    return localStorage.getItem(CURRENT_USER_KEY) || null;
  } catch {
    return null;
  }
}

export function setCurrentUserName(name) {
  const trimmed = name.trim();
  try {
    localStorage.setItem(CURRENT_USER_KEY, trimmed);
  } catch {
    // Private browsing / blocked storage: name just won't persist across reloads.
  }
  return trimmed;
}
