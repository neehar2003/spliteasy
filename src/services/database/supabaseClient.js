// Shared Supabase client. SplitEasy has no backend of its own - this is the
// one connection every browser tab/device uses to read and write the same
// Postgres database, so data is actually shared across users.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).'
  );
}

export const supabase = createClient(url, anonKey);
